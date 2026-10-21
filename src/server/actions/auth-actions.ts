"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createOrganizationInvite } from "@/server/auth/invite";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { clearSessionCookie, createSession, hashToken, revokeToken, SESSION_COOKIE, setSessionCookie } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { BusinessError, publicMessage } from "@/server/errors";
import { withTx } from "@/server/tx";
import { rethrowRedirect, type ActionState } from "@/server/actions/state";

const attempts = new Map<string, { count: number; at: number }>();

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const login = String(formData.get("login") ?? formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const key = login.toLowerCase() || "unknown";
  const current = attempts.get(key);
  if (current && current.count >= 8 && Date.now() - current.at < 15 * 60_000) {
    return { ok: false, message: "ძალიან ბევრი მცდელობაა. სცადეთ 15 წუთში." };
  }
  try {
    const { equalsInsensitive } = await import("@/server/db");
    const user = await getDb().user.findFirst({
      where: {
        OR: [{ email: login.toLowerCase() }, { username: equalsInsensitive(login) }],
      },
    });
    const valid = user ? await verifyPassword(user.passwordHash, password) : false;
    if (!user || !valid || !user.active) {
      const previous = attempts.get(key);
      attempts.set(key, { count: (previous && Date.now() - previous.at < 15 * 60_000 ? previous.count : 0) + 1, at: Date.now() });
      throw new BusinessError("ელფოსტა ან პაროლი არასწორია", "auth");
    }
    attempts.delete(key);
    const token = await createSession(user.id);
    await setSessionCookie(token);
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeToken(token);
  await clearSessionCookie();
  redirect("/login");
}

export async function acceptInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const token = String(formData.get("token") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (password.length < 10) throw new BusinessError("პაროლი მინიმუმ 10 სიმბოლო უნდა იყოს", "validation");
    const invite = await getDb().invitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
      throw new BusinessError("მოწვევა აღარ მოქმედებს", "invite");
    }
    const passwordHash = await hashPassword(password);
    const user = await withTx(async (tx) => {
      const created = await tx.user.upsert({
        where: { email: invite.email.toLowerCase() },
        update: { passwordHash, name, active: true },
        create: { email: invite.email.toLowerCase(), name, passwordHash },
      });
      await tx.membership.upsert({
        where: { organizationId_userId: { organizationId: invite.organizationId, userId: created.id } },
        update: { roleId: invite.roleId, active: true },
        create: { organizationId: invite.organizationId, userId: created.id, roleId: invite.roleId },
      });
      await tx.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      return created;
    });
    await setSessionCookie(await createSession(user.id));
  } catch (error) {
    rethrowRedirect(error);
    return { ok: false, message: publicMessage(error) };
  }
  redirect("/");
}

export async function createOrganizationForInvite(input: { orgName: string; email: string; roleCode?: string }): Promise<string> {
  return createOrganizationInvite(input);
}
