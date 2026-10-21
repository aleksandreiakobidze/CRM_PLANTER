import { getDb } from "@/server/db";
import { appUrl } from "@/server/env";
import { BusinessError } from "@/server/errors";
import { openSecret, sealSecret } from "@/server/features/integrations/secret";
import { ADMIN_COPY } from "@/server/features/admin/admin-copy";

const SCOPES = "User.Read Calendars.ReadWrite Mail.Send offline_access";
const GRAPH = "https://graph.microsoft.com/v1.0";

function nextIsoDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export type MicrosoftTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

export function microsoftConfigured(): boolean {
  return Boolean(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID);
}

export function microsoftRedirectUri(): string {
  return `${appUrl()}/api/integrations/microsoft/callback`;
}

export function microsoftAuthorizeUrl(state: string): string {
  if (!microsoftConfigured()) throw new BusinessError(ADMIN_COPY.m365Missing, "not_configured");
  const tenant = process.env.AZURE_TENANT_ID as string;
  const params = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID as string,
    response_type: "code",
    redirect_uri: microsoftRedirectUri(),
    response_mode: "query",
    scope: SCOPES,
    state,
  });
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function tokenRequest(body: URLSearchParams) {
  const tenant = process.env.AZURE_TENANT_ID as string;
  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new BusinessError(json.error_description || ADMIN_COPY.m365Missing, "microsoft");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000,
  } satisfies MicrosoftTokens;
}

export async function exchangeCode(code: string): Promise<MicrosoftTokens> {
  return tokenRequest(
    new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID as string,
      client_secret: process.env.AZURE_CLIENT_SECRET as string,
      grant_type: "authorization_code",
      code,
      redirect_uri: microsoftRedirectUri(),
      scope: SCOPES,
    }),
  );
}

async function refreshTokens(tokens: MicrosoftTokens): Promise<MicrosoftTokens> {
  if (!tokens.refreshToken) return tokens;
  return tokenRequest(
    new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID as string,
      client_secret: process.env.AZURE_CLIENT_SECRET as string,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      scope: SCOPES,
    }),
  );
}

export async function graphMe(accessToken: string): Promise<{ id: string; mail?: string; userPrincipalName?: string }> {
  const response = await fetch(`${GRAPH}/me?$select=id,mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new BusinessError(ADMIN_COPY.m365Missing, "microsoft");
  return response.json() as Promise<{ id: string; mail?: string; userPrincipalName?: string }>;
}

export async function loadUserTokens(userId: string): Promise<MicrosoftTokens | null> {
  const row = await getDb().userIntegration.findUnique({
    where: { userId_provider: { userId, provider: "microsoft" } },
  });
  if (!row || row.status !== "configured" || !row.secretCipher) return null;
  const tokens = JSON.parse(openSecret(row.secretCipher)) as MicrosoftTokens;
  if (tokens.expiresAt > Date.now() + 30_000) return tokens;
  try {
    const next = await refreshTokens(tokens);
    await getDb().userIntegration.update({
      where: { id: row.id },
      data: {
        secretCipher: sealSecret(JSON.stringify(next)),
        expiresAt: new Date(next.expiresAt),
        lastError: null,
      },
    });
    return next;
  } catch (error) {
    await getDb().userIntegration.update({
      where: { id: row.id },
      data: { status: "error", lastError: error instanceof Error ? error.message : "refresh" },
    });
    return null;
  }
}

export async function saveUserMicrosoft(
  input: {
    userId: string;
    organizationId: string;
    tokens: MicrosoftTokens;
    microsoftUserId: string;
    email: string;
  },
) {
  await getDb().userIntegration.upsert({
    where: { userId_provider: { userId: input.userId, provider: "microsoft" } },
    update: {
      status: "configured",
      secretCipher: sealSecret(JSON.stringify(input.tokens)),
      expiresAt: new Date(input.tokens.expiresAt),
      microsoftUserId: input.microsoftUserId,
      email: input.email,
      lastError: null,
    },
    create: {
      organizationId: input.organizationId,
      userId: input.userId,
      provider: "microsoft",
      status: "configured",
      secretCipher: sealSecret(JSON.stringify(input.tokens)),
      expiresAt: new Date(input.tokens.expiresAt),
      microsoftUserId: input.microsoftUserId,
      email: input.email,
    },
  });
}

export async function disconnectMicrosoft(userId: string) {
  await getDb().userIntegration.updateMany({
    where: { userId, provider: "microsoft" },
    data: { status: "not_configured", secretCipher: null, expiresAt: null, lastError: null },
  });
}

export async function graphJson<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 204) return undefined as T;
  const json = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new BusinessError(json.error?.message || ADMIN_COPY.m365Missing, "microsoft");
  return json;
}

export async function upsertCalendarEvent(
  accessToken: string,
  input: { graphEventId?: string | null; title: string; date: string; body: string },
): Promise<{ id: string; etag?: string }> {
  const payload = {
    subject: input.title,
    isAllDay: true,
    start: { dateTime: `${input.date}T00:00:00`, timeZone: "Asia/Tbilisi" },
    end: { dateTime: `${nextIsoDate(input.date)}T00:00:00`, timeZone: "Asia/Tbilisi" },
    body: { contentType: "text", content: input.body },
  };
  if (input.graphEventId) {
    return graphJson<{ id: string; "@odata.etag"?: string }>(accessToken, `/me/events/${input.graphEventId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }).then((row) => ({ id: row.id, etag: row["@odata.etag"] }));
  }
  return graphJson<{ id: string; "@odata.etag"?: string }>(accessToken, "/me/events", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((row) => ({ id: row.id, etag: row["@odata.etag"] }));
}

export async function deleteCalendarEvent(accessToken: string, graphEventId: string) {
  await fetch(`${GRAPH}/me/events/${graphEventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function sendMail(
  accessToken: string,
  input: { to: string; subject: string; body: string },
) {
  await graphJson(accessToken, "/me/sendMail", {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "text", content: input.body },
        toRecipients: [{ emailAddress: { address: input.to } }],
      },
    }),
  });
}
