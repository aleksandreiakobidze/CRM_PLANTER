import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { appUrl } from "@/server/env";
import { BusinessError } from "@/server/errors";
import { exchangeCode, graphMe, saveUserMicrosoft } from "@/server/features/integrations/microsoft-graph";
import { refreshOrgEmailStatus } from "@/server/features/integrations/calendar-sync";

export const dynamic = "force-dynamic";

const COOKIE = "planter_ms_state";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);
  try {
    const actor = await getActor();
    if (!code || !state || !expected || state !== expected) {
      throw new BusinessError("state", "microsoft");
    }
    const tokens = await exchangeCode(code);
    const me = await graphMe(tokens.accessToken);
    await saveUserMicrosoft({
      userId: actor.userId,
      organizationId: actor.organizationId,
      tokens,
      microsoftUserId: me.id,
      email: me.mail || me.userPrincipalName || actor.email,
    });
    await refreshOrgEmailStatus(actor.organizationId);
    return NextResponse.redirect(`${appUrl()}/settings?m365=ok`);
  } catch {
    return NextResponse.redirect(`${appUrl()}/settings?m365=error`);
  }
}
