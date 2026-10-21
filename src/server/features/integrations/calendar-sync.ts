import type { Actor } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { appUrl } from "@/server/env";
import { formatDateOnly } from "@/server/time";
import {
  deleteCalendarEvent,
  loadUserTokens,
  sendMail,
  upsertCalendarEvent,
} from "@/server/features/integrations/microsoft-graph";

type CalendarOp = "upsert" | "delete";

export async function queueTaskCalendarSync(organizationId: string, taskId: string, op: CalendarOp) {
  const task = await getDb().task.findFirst({
    where: { id: taskId, organizationId },
    include: { assignments: true },
  });
  if (!task) return;
  const userIds = new Set<string>(task.assignments.map((item) => item.userId));
  if (task.createdById) userIds.add(task.createdById);
  const connections = await getDb().userIntegration.findMany({
    where: { userId: { in: [...userIds] }, provider: "microsoft", status: "configured" },
    select: { userId: true },
  });
  if (connections.length === 0) return;
  const type = op === "delete" || !task.dueOn ? "microsoft.calendar.delete" : "microsoft.calendar.upsert";
  await getDb().outboxEvent.createMany({
    data: connections.map((row) => ({
      organizationId,
      type,
      payload: { taskId, userId: row.userId },
    })),
  });
}

export async function queueTaskAssignmentMail(actor: Actor, taskId: string, assigneeIds: string[]) {
  const recipients = assigneeIds.filter((id) => id !== actor.userId);
  if (recipients.length === 0) return;
  const connected = await getDb().userIntegration.findFirst({
    where: { userId: actor.userId, provider: "microsoft", status: "configured" },
  });
  if (!connected) return;
  const users = await getDb().user.findMany({
    where: { id: { in: recipients } },
    select: { id: true, email: true, name: true },
  });
  const task = await getDb().task.findUnique({ where: { id: taskId }, select: { title: true } });
  if (!task) return;
  await getDb().outboxEvent.createMany({
    data: users.map((user) => ({
      organizationId: actor.organizationId,
      type: "microsoft.mail.send",
      payload: {
        userId: actor.userId,
        to: user.email,
        subject: task.title,
        body: `${task.title}\n${appUrl()}/work/${taskId}`,
      },
    })),
  });
}

export async function queueInviteMail(actor: Actor, email: string, name: string, url: string) {
  const connected = await getDb().userIntegration.findFirst({
    where: { userId: actor.userId, provider: "microsoft", status: "configured" },
  });
  if (!connected) return;
  await getDb().outboxEvent.create({
    data: {
      organizationId: actor.organizationId,
      type: "microsoft.mail.send",
      payload: {
        userId: actor.userId,
        to: email,
        subject: name,
        body: url,
      },
    },
  });
}

export async function refreshOrgEmailStatus(organizationId: string) {
  const connected = await getDb().userIntegration.count({
    where: { organizationId, provider: "microsoft", status: "configured" },
  });
  await getDb().integrationConnection.upsert({
    where: { organizationId_provider: { organizationId, provider: "email" } },
    update: { status: connected > 0 ? "configured" : "not_configured" },
    create: { organizationId, provider: "email", status: connected > 0 ? "configured" : "not_configured" },
  });
}

export async function processMicrosoftOutbox(event: { id: string; type: string; payload: unknown }) {
  const payload = event.payload as {
    taskId?: string;
    userId?: string;
    to?: string;
    subject?: string;
    body?: string;
  };
  if (!payload.userId) throw new Error("userId");
  const tokens = await loadUserTokens(payload.userId);
  if (!tokens) {
    await getDb().outboxEvent.update({
      where: { id: event.id },
      data: { status: "not_configured", lastError: "microsoft", attempts: { increment: 1 } },
    });
    return;
  }
  if (event.type === "microsoft.mail.send" && payload.to && payload.subject && payload.body) {
    await sendMail(tokens.accessToken, { to: payload.to, subject: payload.subject, body: payload.body });
    await getDb().outboxEvent.update({ where: { id: event.id }, data: { status: "sent" } });
    return;
  }
  if (!payload.taskId) throw new Error("taskId");
  const task = await getDb().task.findUnique({ where: { id: payload.taskId } });
  const link = await getDb().calendarSyncLink.findUnique({
    where: { taskId_userId: { taskId: payload.taskId, userId: payload.userId } },
  });
  if (event.type === "microsoft.calendar.delete" || !task || !task.dueOn || task.status === "cancelled") {
    if (link) {
      await deleteCalendarEvent(tokens.accessToken, link.graphEventId);
      await getDb().calendarSyncLink.delete({ where: { id: link.id } });
    }
    await getDb().outboxEvent.update({ where: { id: event.id }, data: { status: "sent" } });
    return;
  }
  const date = formatDateOnly(task.dueOn);
  const saved = await upsertCalendarEvent(tokens.accessToken, {
    graphEventId: link?.graphEventId,
    title: task.title,
    date,
    body: `${appUrl()}/work/${task.id}`,
  });
  await getDb().calendarSyncLink.upsert({
    where: { taskId_userId: { taskId: task.id, userId: payload.userId } },
    update: { graphEventId: saved.id, etag: saved.etag ?? null },
    create: { taskId: task.id, userId: payload.userId, graphEventId: saved.id, etag: saved.etag ?? null },
  });
  await getDb().outboxEvent.update({ where: { id: event.id }, data: { status: "sent" } });
}
