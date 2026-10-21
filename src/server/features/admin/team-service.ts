import { randomBytes } from "crypto";
import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { hashToken } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { appUrl } from "@/server/env";
import { BusinessError } from "@/server/errors";
import { queueInviteMail } from "@/server/features/integrations/calendar-sync";

export async function listTeam(actor: Actor) {
  requirePermission(actor, "admin.users");
  return getDb().membership.findMany({
    where: { organizationId: actor.organizationId, active: true },
    include: { user: { select: { id: true, name: true, email: true, username: true } }, role: true },
    orderBy: { user: { name: "asc" } },
  });
}

export async function listAssignableRoles(actor: Actor) {
  requirePermission(actor, "admin.users");
  return getDb().role.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: { nameKa: "asc" },
  });
}

export async function setMemberRole(actor: Actor, membershipId: string, roleId: string) {
  requirePermission(actor, "admin.users");
  const membership = await getDb().membership.findFirst({
    where: { id: membershipId, organizationId: actor.organizationId },
    include: { role: true },
  });
  if (!membership) throw new BusinessError("წევრი არ მოიძებნა", "not_found");
  const role = await getDb().role.findFirst({
    where: { id: roleId, organizationId: actor.organizationId },
  });
  if (!role) throw new BusinessError("როლი არ მოიძებნა", "not_found");
  if (membership.role.code === "owner" && role.code !== "owner") {
    const owners = await getDb().membership.count({
      where: { organizationId: actor.organizationId, active: true, role: { code: "owner" } },
    });
    if (owners <= 1) throw new BusinessError("ბოლო ადმინისტრატორის როლი არ იცვლება", "validation");
  }
  await getDb().membership.update({
    where: { id: membership.id },
    data: { roleId: role.id },
  });
}

export async function inviteMember(actor: Actor, input: { email: string; name?: string; roleId: string }) {
  requirePermission(actor, "admin.users");
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BusinessError("ელფოსტა არასწორია", "validation");
  }
  const role = await getDb().role.findFirst({
    where: { id: input.roleId, organizationId: actor.organizationId },
  });
  if (!role) throw new BusinessError("როლი არ მოიძებნა", "not_found");
  const existing = await getDb().membership.findFirst({
    where: { organizationId: actor.organizationId, user: { email }, active: true },
  });
  if (existing) throw new BusinessError("ეს მომხმარებელი უკვე გუნდშია", "validation");
  const token = randomBytes(24).toString("base64url");
  await getDb().invitation.create({
    data: {
      organizationId: actor.organizationId,
      email,
      roleId: role.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 2 * 86_400_000),
      createdById: actor.userId,
    },
  });
  const url = `${appUrl()}/invite/${token}`;
  await queueInviteMail(actor, email, input.name?.trim() || email, url);
  return { token, url };
}
