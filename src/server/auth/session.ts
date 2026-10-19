import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import type { Actor } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { BusinessError } from "@/server/errors";

export const SESSION_COOKIE = "planter_session";
const SESSION_DAYS = 14;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await getDb().session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
  return token;
}

export async function actorFromToken(token: string): Promise<Actor> {
  const session = await getDb().session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            where: { active: true },
            include: { role: { include: { permissions: { include: { permission: true } } } } },
          },
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    throw new BusinessError("სესია აღარ მოქმედებს", "unauthenticated");
  }
  if (!session.user.active) {
    throw new BusinessError("მომხმარებელი გამორთულია", "unauthenticated");
  }
  const membership = session.user.memberships[0];
  if (!membership) throw new BusinessError("ორგანიზაციაზე წვდომა არ არის", "forbidden");
  return {
    userId: session.user.id,
    organizationId: membership.organizationId,
    email: session.user.email,
    permissions: new Set(membership.role.permissions.map((item) => item.permission.code)),
  };
}

export async function getActor(): Promise<Actor> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) throw new BusinessError("შესვლა საჭიროა", "unauthenticated");
  return actorFromToken(token);
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await getDb().session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeToken(token: string): Promise<void> {
  await getDb().session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
