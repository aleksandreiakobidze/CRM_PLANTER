import type { Actor } from "@/server/auth/permissions";
import { getDb, type Tx } from "@/server/db";

export type NotificationDto = {
  id: string;
  kind: string;
  title: string;
  href: string;
  createdAt: string;
  read: boolean;
};

export async function notifyOthers(
  tx: Tx,
  actor: Actor,
  input: { kind: "task" | "excursion"; entityId: string; title: string; href: string },
) {
  const members = await tx.membership.findMany({
    where: {
      organizationId: actor.organizationId,
      active: true,
      userId: { not: actor.userId },
      user: { active: true },
    },
    select: { userId: true },
  });
  if (members.length === 0) return;
  await tx.notification.createMany({
    data: members.map((member) => ({
      organizationId: actor.organizationId,
      userId: member.userId,
      kind: input.kind,
      entityId: input.entityId,
      title: input.title,
      href: input.href,
    })),
  });
}

export async function listNotifications(actor: Actor): Promise<{ unread: number; items: NotificationDto[] }> {
  const where = { organizationId: actor.organizationId, userId: actor.userId };
  const [rows, unread] = await Promise.all([
    getDb().notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 30 }),
    getDb().notification.count({ where: { ...where, readAt: null } }),
  ]);
  return {
    unread,
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      href: row.href,
      createdAt: row.createdAt.toISOString(),
      read: row.readAt !== null,
    })),
  };
}

export async function markNotificationRead(actor: Actor, id: string) {
  await getDb().notification.updateMany({
    where: { id, organizationId: actor.organizationId, userId: actor.userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(actor: Actor) {
  await getDb().notification.updateMany({
    where: { organizationId: actor.organizationId, userId: actor.userId, readAt: null },
    data: { readAt: new Date() },
  });
}
