import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { BusinessError } from "@/server/errors";

export async function listTeam(actor: Actor) {
  requirePermission(actor, "admin.users");
  return getDb().membership.findMany({
    where: { organizationId: actor.organizationId, active: true },
    include: { user: { select: { id: true, name: true, email: true } }, role: true },
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
