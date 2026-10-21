import type { Actor } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { BusinessError, isUniqueViolation } from "@/server/errors";
import { CHAT_COPY } from "@/server/features/chat/chat-copy";
import { getTask } from "@/server/features/crm/customer-service";

const TEAM_KEY = "team";
const MAX_BODY = 2000;

export type ChatMessageDto = {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  mine: boolean;
  body: string;
  createdAt: string;
};

export type ChatThreadDto = {
  id: string;
  kind: "team" | "direct" | "task";
  title: string;
  preview: string;
  unread: number;
  updatedAt: string;
};

function taskPairKey(taskId: string) {
  return `task:${taskId}`;
}

export type ChatMemberDto = { id: string; name: string };

function pairKeyFor(a: string, b: string) {
  return [a, b].sort().join(":");
}

async function orgMembers(organizationId: string) {
  return getDb().membership.findMany({
    where: { organizationId, active: true, user: { active: true } },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });
}

async function addMissingParticipants(threadId: string, userIds: string[]) {
  if (userIds.length === 0) return;
  await getDb().chatParticipant.createMany({
    data: userIds.map((userId) => ({ threadId, userId })),
    skipDuplicates: true,
  });
}

export async function ensureTeamThread(actor: Actor) {
  const existing = await getDb().chatThread.findUnique({
    where: { organizationId_pairKey: { organizationId: actor.organizationId, pairKey: TEAM_KEY } },
  });
  const thread =
    existing ??
    (await getDb()
      .chatThread.create({
        data: { organizationId: actor.organizationId, kind: "team", pairKey: TEAM_KEY },
      })
      .catch(async (error) => {
        if (!isUniqueViolation(error)) throw error;
        return getDb().chatThread.findUniqueOrThrow({
          where: { organizationId_pairKey: { organizationId: actor.organizationId, pairKey: TEAM_KEY } },
        });
      }));
  const members = await orgMembers(actor.organizationId);
  await addMissingParticipants(thread.id, members.map((item) => item.user.id));
  return thread;
}

async function requireAccess(actor: Actor, threadId: string) {
  const thread = await getDb().chatThread.findFirst({
    where: { id: threadId, organizationId: actor.organizationId },
    include: { participants: true },
  });
  if (!thread) throw new BusinessError(CHAT_COPY.noThread, "not_found");
  if (thread.kind === "team") {
    await addMissingParticipants(thread.id, [actor.userId]);
    return thread;
  }
  if (thread.kind === "task") {
    const taskId = thread.pairKey?.startsWith("task:") ? thread.pairKey.slice(5) : "";
    if (!taskId) throw new BusinessError(CHAT_COPY.noThread, "not_found");
    await getTask(actor, taskId);
    await addMissingParticipants(thread.id, [actor.userId]);
    return thread;
  }
  if (!thread.participants.some((item) => item.userId === actor.userId)) {
    throw new BusinessError(CHAT_COPY.noThread, "forbidden");
  }
  return thread;
}

export async function ensureTaskThread(actor: Actor, taskId: string) {
  const task = await getTask(actor, taskId);
  const pairKey = taskPairKey(task.id);
  const existing = await getDb().chatThread.findUnique({
    where: { organizationId_pairKey: { organizationId: actor.organizationId, pairKey } },
  });
  const thread =
    existing ??
    (await getDb()
      .chatThread.create({
        data: { organizationId: actor.organizationId, kind: "task", pairKey },
      })
      .catch(async (error) => {
        if (!isUniqueViolation(error)) throw error;
        return getDb().chatThread.findUniqueOrThrow({
          where: { organizationId_pairKey: { organizationId: actor.organizationId, pairKey } },
        });
      }));
  const userIds = [...new Set([
    ...task.assignments.map((item) => item.userId),
    task.createdById,
    actor.userId,
  ].filter((id): id is string => Boolean(id)))];
  await addMissingParticipants(thread.id, userIds);
  return { thread, task };
}

export async function openDirect(actor: Actor, userId: string) {
  if (userId === actor.userId) throw new BusinessError(CHAT_COPY.self, "validation");
  const peer = await getDb().membership.findFirst({
    where: { organizationId: actor.organizationId, userId, active: true, user: { active: true } },
  });
  if (!peer) throw new BusinessError(CHAT_COPY.noPeer, "not_found");
  const pairKey = pairKeyFor(actor.userId, userId);
  const existing = await getDb().chatThread.findUnique({
    where: { organizationId_pairKey: { organizationId: actor.organizationId, pairKey } },
  });
  const thread =
    existing ??
    (await getDb()
      .chatThread.create({
        data: { organizationId: actor.organizationId, kind: "direct", pairKey },
      })
      .catch(async (error) => {
        if (!isUniqueViolation(error)) throw error;
        return getDb().chatThread.findUniqueOrThrow({
          where: { organizationId_pairKey: { organizationId: actor.organizationId, pairKey } },
        });
      }));
  await addMissingParticipants(thread.id, [actor.userId, userId]);
  return thread;
}

export async function listInbox(actor: Actor) {
  await ensureTeamThread(actor);
  const [me, members, threads] = await Promise.all([
    getDb().user.findUniqueOrThrow({ where: { id: actor.userId }, select: { id: true, name: true } }),
    orgMembers(actor.organizationId),
    getDb().chatThread.findMany({
      where: { organizationId: actor.organizationId, participants: { some: { userId: actor.userId } } },
      include: {
        participants: { include: { user: { select: { id: true, name: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, include: { author: { select: { name: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const taskIds = threads
    .filter((item) => item.kind === "task" && item.pairKey?.startsWith("task:"))
    .map((item) => item.pairKey!.slice(5));
  const taskRows = taskIds.length
    ? await getDb().task.findMany({
        where: { id: { in: taskIds }, organizationId: actor.organizationId },
        select: { id: true, title: true },
      })
    : [];
  const taskTitle = new Map(taskRows.map((item) => [item.id, item.title]));
  const rows: ChatThreadDto[] = [];
  for (const thread of threads) {
    const mine = thread.participants.find((item) => item.userId === actor.userId);
    const last = thread.messages[0];
    const unread = await getDb().chatMessage.count({
      where: {
        threadId: thread.id,
        authorId: { not: actor.userId },
        createdAt: { gt: mine?.lastReadAt ?? new Date(0) },
      },
    });
    const peer = thread.participants.find((item) => item.userId !== actor.userId)?.user;
    const linkedTaskId = thread.kind === "task" && thread.pairKey?.startsWith("task:") ? thread.pairKey.slice(5) : "";
    rows.push({
      id: thread.id,
      kind: thread.kind === "direct" ? "direct" : thread.kind === "task" ? "task" : "team",
      title: thread.kind === "team"
        ? CHAT_COPY.team
        : thread.kind === "task"
          ? (taskTitle.get(linkedTaskId) ?? CHAT_COPY.task)
          : (peer?.name ?? CHAT_COPY.chat),
      preview: last?.body ?? "",
      unread,
      updatedAt: (last?.createdAt ?? thread.updatedAt).toISOString(),
    });
  }
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    me,
    threads: rows,
    members: members.filter((item) => item.user.id !== actor.userId).map((item) => ({ id: item.user.id, name: item.user.name })),
    unread: rows.reduce((sum, row) => sum + row.unread, 0),
  };
}

export async function listMessages(actor: Actor, threadId: string, after?: string) {
  await requireAccess(actor, threadId);
  const where = after
    ? { threadId, createdAt: { gt: new Date(after) } }
    : { threadId };
  const rows = await getDb().chatMessage.findMany({
    where,
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: after ? "asc" : "desc" },
    take: 80,
  });
  const ordered = after ? rows : [...rows].reverse();
  await getDb().chatParticipant.update({
    where: { threadId_userId: { threadId, userId: actor.userId } },
    data: { lastReadAt: new Date() },
  });
  return ordered.map((row) => ({
    id: row.id,
    threadId: row.threadId,
    authorId: row.authorId,
    authorName: row.author.name,
    mine: row.authorId === actor.userId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  })) satisfies ChatMessageDto[];
}

export async function sendMessage(actor: Actor, threadId: string, raw: string) {
  const body = raw.trim();
  if (!body) throw new BusinessError(CHAT_COPY.needText, "validation");
  if (body.length > MAX_BODY) throw new BusinessError(CHAT_COPY.tooLong, "validation");
  await requireAccess(actor, threadId);
  const row = await getDb().chatMessage.create({
    data: { threadId, authorId: actor.userId, body },
    include: { author: { select: { name: true } } },
  });
  await getDb().chatThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
  await getDb().chatParticipant.update({
    where: { threadId_userId: { threadId, userId: actor.userId } },
    data: { lastReadAt: row.createdAt },
  });
  return {
    id: row.id,
    threadId: row.threadId,
    authorId: row.authorId,
    authorName: row.author.name,
    mine: true,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  } satisfies ChatMessageDto;
}
