import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { audit } from "@/server/audit";
import { getDb, type Tx } from "@/server/db";
import { BusinessError } from "@/server/errors";
import { normalizePhone, primaryPhone } from "@/server/phone";
import { parseDateOnly, tbilisiDateString } from "@/server/time";
import { prepareTaskFiles, readTaskBytes, removeTaskFiles, writeTaskFiles } from "@/server/features/crm/task-files";
import { withTx } from "@/server/tx";

const STATUSES = new Set(["fresh", "to_contact", "quote_sent", "customer", "declined"]);
const PRIORITIES = new Set(["A", "B", "C"]);
const VERIFICATIONS = new Set(["verified"]);

function blank(value?: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function optionalCode(value: string | undefined, allowed: Set<string>, message: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (!allowed.has(trimmed)) throw new BusinessError(message, "validation");
  return trimmed;
}
const TASK_STATUSES = new Set(["open", "doing", "done"]);

function statusFromAssignments(assignments: { status: string }[]) {
  const done = assignments.filter((item) => item.status === "done").length;
  if (assignments.length === 0 || done === 0) return "open";
  if (done === assignments.length) return "done";
  return "doing";
}

async function loadOrgTask(tx: Tx, organizationId: string, taskId: string) {
  const task = await tx.task.findFirst({
    where: { id: taskId, organizationId },
    include: { assignments: true },
  });
  if (!task) throw new BusinessError("დავალება ვერ მოიძებნა", "not_found");
  return task;
}

export async function findDuplicateCustomers(organizationId: string, input: { identificationCode?: string; phone?: string; email?: string }) {
  const phone = input.phone ? primaryPhone(input.phone) : "";
  const or = [
    input.identificationCode ? { identificationCode: input.identificationCode } : undefined,
    phone ? { phoneNormalized: phone } : undefined,
    input.email ? { email: input.email.toLowerCase() } : undefined,
  ].filter(Boolean) as { identificationCode?: string; phoneNormalized?: string; email?: string }[];
  if (or.length === 0) return [];
  return getDb().customer.findMany({
    where: { organizationId, mergedIntoId: null, OR: or },
    select: { id: true, name: true, identificationCode: true, phone: true, email: true },
  });
}

export async function createCustomer(
  actor: Actor,
  input: {
    kind: "company" | "person";
    name: string;
    legalName?: string;
    directorName?: string;
    identificationCode?: string;
    segment?: string;
    relationshipStatus?: string;
    doNotContact?: boolean;
    region?: string;
    city?: string;
    district?: string;
    venueType?: string;
    phone?: string;
    email?: string;
    website?: string;
    mapsUrl?: string;
    source?: string;
    priority?: string;
    verification?: string;
    notes?: string;
    nextContactOn?: string;
    confirmDuplicate?: boolean;
  },
) {
  requirePermission(actor, "crm.write");
  const status = input.relationshipStatus ?? "fresh";
  if (!STATUSES.has(status)) throw new BusinessError("ურთიერთობის სტატუსი არასწორია", "validation");
  if (!input.name.trim()) throw new BusinessError("სახელი სავალდებულოა", "validation");
  const priority = optionalCode(input.priority, PRIORITIES, "პრიორიტეტი A, B ან C უნდა იყოს");
  const verification = optionalCode(input.verification, VERIFICATIONS, "ვერიფიკაცია არასწორია");
  const phone = input.phone?.trim() || "";
  const duplicates = await findDuplicateCustomers(actor.organizationId, input);
  if (duplicates.length > 0 && !input.confirmDuplicate) {
    throw new BusinessError(`მსგავსი ჩანაწერი უკვე არის: ${duplicates.map((item) => item.name).join(", ")}`, "duplicate");
  }
  return withTx(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        organizationId: actor.organizationId,
        kind: input.kind,
        name: input.name.trim(),
        legalName: blank(input.legalName),
        directorName: blank(input.directorName),
        identificationCode: input.identificationCode,
        segment: input.segment || "other",
        relationshipStatus: status,
        doNotContact: input.doNotContact ?? false,
        region: blank(input.region),
        city: blank(input.city),
        district: blank(input.district),
        venueType: blank(input.venueType),
        phone: phone || null,
        phoneNormalized: phone ? primaryPhone(phone) || null : null,
        email: input.email?.trim() ? input.email.trim().toLowerCase() : null,
        website: blank(input.website),
        mapsUrl: blank(input.mapsUrl),
        source: blank(input.source),
        priority,
        verification,
        notes: blank(input.notes),
        nextContactOn: input.nextContactOn ? parseDateOnly(input.nextContactOn) : null,
        ownerId: actor.userId,
      },
    });
    await audit(tx, actor, "customer.create", "customer", customer.id, undefined, { name: customer.name });
    return customer;
  });
}

export async function updateCustomer(
  actor: Actor,
  customerId: string,
  input: {
    kind: "company" | "person";
    name: string;
    legalName?: string;
    directorName?: string;
    identificationCode?: string;
    segment?: string;
    relationshipStatus?: string;
    doNotContact?: boolean;
    region?: string;
    city?: string;
    district?: string;
    venueType?: string;
    phone?: string;
    email?: string;
    website?: string;
    mapsUrl?: string;
    source?: string;
    priority?: string;
    verification?: string;
    notes?: string;
    nextContactOn?: string;
    confirmDuplicate?: boolean;
  },
) {
  requirePermission(actor, "crm.write");
  const existing = await getDb().customer.findFirst({
    where: { id: customerId, organizationId: actor.organizationId, mergedIntoId: null },
  });
  if (!existing) throw new BusinessError("კლიენტი ვერ მოიძებნა", "not_found");
  const status = input.relationshipStatus ?? existing.relationshipStatus;
  if (!STATUSES.has(status)) throw new BusinessError("ურთიერთობის სტატუსი არასწორია", "validation");
  if (!input.name.trim()) throw new BusinessError("სახელი სავალდებულოა", "validation");
  const priority = optionalCode(input.priority, PRIORITIES, "პრიორიტეტი A, B ან C უნდა იყოს");
  const verification = optionalCode(input.verification, VERIFICATIONS, "ვერიფიკაცია არასწორია");
  const duplicates = (await findDuplicateCustomers(actor.organizationId, input)).filter((item) => item.id !== customerId);
  if (duplicates.length > 0 && !input.confirmDuplicate) {
    throw new BusinessError(`მსგავსი ჩანაწერი უკვე არის: ${duplicates.map((item) => item.name).join(", ")}`, "duplicate");
  }
  const phone = input.phone?.trim() || "";
  return withTx(async (tx) => {
    const customer = await tx.customer.update({
      where: { id: customerId },
      data: {
        kind: input.kind,
        name: input.name.trim(),
        legalName: input.legalName?.trim() || null,
        directorName: input.directorName?.trim() || null,
        identificationCode: input.identificationCode?.trim() || null,
        segment: input.segment || "other",
        relationshipStatus: status,
        doNotContact: input.doNotContact ?? false,
        region: input.region?.trim() || null,
        city: input.city?.trim() || null,
        district: input.district?.trim() || null,
        venueType: input.venueType?.trim() || null,
        phone: phone || null,
        phoneNormalized: phone ? primaryPhone(phone) || null : null,
        email: input.email?.trim() ? input.email.trim().toLowerCase() : null,
        website: input.website?.trim() || null,
        mapsUrl: input.mapsUrl?.trim() || null,
        source: input.source?.trim() || null,
        priority,
        verification,
        notes: input.notes?.trim() || null,
        nextContactOn: input.nextContactOn ? parseDateOnly(input.nextContactOn) : null,
      },
    });
    await audit(tx, actor, "customer.update", "customer", customer.id, { name: existing.name }, { name: customer.name });
    return customer;
  });
}

export async function addContact(actor: Actor, input: { customerId: string; name: string; phone?: string; email?: string; title?: string; isPrimary?: boolean }) {
  requirePermission(actor, "crm.write");
  const name = input.name.trim();
  if (!name) throw new BusinessError("სახელი სავალდებულოა", "validation");
  const customer = await getDb().customer.findFirst({ where: { id: input.customerId, organizationId: actor.organizationId, mergedIntoId: null } });
  if (!customer) throw new BusinessError("კლიენტი ვერ მოიძებნა", "not_found");
  const phone = input.phone?.trim() || "";
  const email = input.email?.trim().toLowerCase() || "";
  return withTx(async (tx) => {
    if (input.isPrimary) {
      await tx.contact.updateMany({ where: { customerId: customer.id, organizationId: actor.organizationId }, data: { isPrimary: false } });
    }
    return tx.contact.create({
      data: {
        organizationId: actor.organizationId,
        customerId: customer.id,
        name,
        title: input.title?.trim() || null,
        phone: phone || null,
        phoneNormalized: phone ? normalizePhone(phone) : null,
        email: email || null,
        isPrimary: Boolean(input.isPrimary),
      },
    });
  });
}

export async function addAddress(actor: Actor, input: { customerId: string; label?: string; line1: string; city?: string; region?: string; district?: string }) {
  requirePermission(actor, "crm.write");
  const line1 = input.line1.trim();
  if (!line1) throw new BusinessError("ქუჩა სავალდებულოა", "validation");
  const customer = await getDb().customer.findFirst({ where: { id: input.customerId, organizationId: actor.organizationId, mergedIntoId: null } });
  if (!customer) throw new BusinessError("კლიენტი ვერ მოიძებნა", "not_found");
  return getDb().address.create({
    data: {
      organizationId: actor.organizationId,
      customerId: customer.id,
      label: input.label?.trim() || "მთავარი",
      line1,
      city: input.city?.trim() || null,
      region: input.region?.trim() || null,
      district: input.district?.trim() || null,
    },
  });
}

export async function addActivity(actor: Actor, input: { customerId: string; type: string; result?: string; body: string }) {
  requirePermission(actor, "crm.write");
  return getDb().activity.create({
    data: {
      organizationId: actor.organizationId,
      customerId: input.customerId,
      type: input.type,
      result: input.result,
      body: input.body,
      actorId: actor.userId,
    },
  });
}

export async function createTask(
  actor: Actor,
  input: {
    title: string;
    description?: string;
    dueOn?: string;
    customerId?: string;
    assigneeIds?: string[];
    type?: string;
    files?: { name: string; bytes: Buffer }[];
  },
) {
  requirePermission(actor, "crm.write");
  const title = input.title.trim();
  if (!title) throw new BusinessError("სათაური სავალდებულოა", "validation");
  const assigneeIds = input.assigneeIds === undefined
    ? [actor.userId]
    : [...new Set(input.assigneeIds.map((id) => id.trim()).filter(Boolean))];
  if (assigneeIds.length === 0) throw new BusinessError("თანამშრომელი სავალდებულოა", "validation");
  const members = await getDb().membership.findMany({
    where: { organizationId: actor.organizationId, active: true, userId: { in: assigneeIds }, user: { active: true } },
    select: { userId: true },
  });
  if (members.length !== assigneeIds.length) throw new BusinessError("თანამშრომელი ამ ორგანიზაციაში არ არის", "validation");
  if (input.customerId) {
    const customer = await getDb().customer.findFirst({
      where: { id: input.customerId, organizationId: actor.organizationId, mergedIntoId: null },
    });
    if (!customer) throw new BusinessError("კლიენტი ვერ მოიძებნა", "not_found");
  }
  const files = prepareTaskFiles(actor.organizationId, input.files ?? []);
  await writeTaskFiles(files);
  try {
    return await withTx(async (tx) => {
      const task = await tx.task.create({
        data: {
          organizationId: actor.organizationId,
          title,
          description: input.description?.trim() || null,
          dueOn: input.dueOn ? parseDateOnly(input.dueOn) : null,
          customerId: input.customerId || null,
          assigneeId: assigneeIds[0],
          createdById: actor.userId,
          type: input.type ?? "follow_up",
          assignments: { create: assigneeIds.map((userId) => ({ userId })) },
          attachments: {
            create: files.map((file) => ({
              id: file.id,
              organizationId: actor.organizationId,
              fileName: file.fileName,
              contentType: file.contentType,
              byteSize: file.bytes.byteLength,
              storageKey: file.storageKey,
              uploadedById: actor.userId,
            })),
          },
        },
      });
      await audit(tx, actor, "task.create", "task", task.id, undefined, { title, assigneeIds });
      return task;
    });
  } catch (error) {
    await removeTaskFiles(files);
    throw error;
  }
}

const taskInclude = {
  customer: true,
  assignee: true,
  createdBy: true,
  assignments: { include: { user: true } },
  attachments: { orderBy: { createdAt: "asc" as const } },
};

export async function listTasks(actor: Actor, scope: "mine" | "all" = "mine") {
  const mineOnly = scope !== "all" || !actor.permissions.has("task.read.all");
  if (!mineOnly && !actor.permissions.has("task.read.all")) throw new BusinessError("ამ მოქმედების უფლება არ გაქვთ", "forbidden");
  return getDb().task.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(mineOnly ? { assignments: { some: { userId: actor.userId } } } : {}),
    },
    include: taskInclude,
    orderBy: [{ dueOn: "asc" }, { createdAt: "desc" }],
  });
}

export async function setTaskStatus(actor: Actor, taskId: string, status: string) {
  requirePermission(actor, "crm.write");
  if (!TASK_STATUSES.has(status)) throw new BusinessError("დავალების სტატუსი არასწორია", "validation");
  return withTx(async (tx) => {
    const task = await loadOrgTask(tx, actor.organizationId, taskId);
    if (task.status === "cancelled") throw new BusinessError("გაუქმებული დავალება ჯერ ხელახლა უნდა გაიხსნას", "validation");
    if (status === "done") {
      await tx.taskAssignment.updateMany({ where: { taskId: task.id }, data: { status: "done", completedAt: new Date() } });
    } else {
      await tx.taskAssignment.updateMany({ where: { taskId: task.id }, data: { status: "open", completedAt: null } });
    }
    const updated = await tx.task.update({ where: { id: task.id }, data: { status } });
    await audit(tx, actor, "task.status", "task", task.id, { status: task.status }, { status });
    return updated;
  });
}

export async function completeAssignment(actor: Actor, taskId: string) {
  return withTx(async (tx) => {
    const task = await loadOrgTask(tx, actor.organizationId, taskId);
    if (task.status === "cancelled") throw new BusinessError("გაუქმებული დავალება ვერ სრულდება", "validation");
    const mine = task.assignments.find((item) => item.userId === actor.userId);
    if (!mine) throw new BusinessError("ეს დავალება თქვენზე არ არის", "forbidden");
    if (mine.status !== "done") {
      await tx.taskAssignment.update({ where: { id: mine.id }, data: { status: "done", completedAt: new Date() } });
    }
    const next = task.assignments.map((item) => (item.userId === actor.userId ? { ...item, status: "done" } : item));
    const status = statusFromAssignments(next);
    const updated = await tx.task.update({ where: { id: task.id }, data: { status } });
    await audit(tx, actor, "task.complete", "task", task.id, { status: task.status }, { status, userId: actor.userId });
    return updated;
  });
}

function canManageTask(actor: Actor, createdById: string | null) {
  return createdById === actor.userId || actor.permissions.has("crm.write");
}

export async function cancelTask(actor: Actor, taskId: string) {
  return withTx(async (tx) => {
    const task = await loadOrgTask(tx, actor.organizationId, taskId);
    if (!canManageTask(actor, task.createdById)) throw new BusinessError("ამ მოქმედების უფლება არ გაქვთ", "forbidden");
    if (task.status === "cancelled") return task;
    const updated = await tx.task.update({ where: { id: task.id }, data: { status: "cancelled" } });
    await audit(tx, actor, "task.cancel", "task", task.id, { status: task.status }, { status: "cancelled" });
    return updated;
  });
}

export async function reopenTask(actor: Actor, taskId: string) {
  return withTx(async (tx) => {
    const task = await loadOrgTask(tx, actor.organizationId, taskId);
    if (!canManageTask(actor, task.createdById)) throw new BusinessError("ამ მოქმედების უფლება არ გაქვთ", "forbidden");
    if (task.status !== "cancelled") throw new BusinessError("მხოლოდ გაუქმებული დავალება იხსნება", "validation");
    const status = statusFromAssignments(task.assignments);
    const updated = await tx.task.update({ where: { id: task.id }, data: { status } });
    await audit(tx, actor, "task.reopen", "task", task.id, { status: "cancelled" }, { status });
    return updated;
  });
}

export async function readTaskFile(actor: Actor, attachmentId: string) {
  const file = await getDb().taskAttachment.findFirst({
    where: { id: attachmentId },
    include: { task: { include: { assignments: true } } },
  });
  if (!file || file.organizationId !== actor.organizationId) throw new BusinessError("ფაილი ვერ მოიძებნა", "not_found");
  const assigned = file.task.assignments.some((item) => item.userId === actor.userId);
  const author = file.task.createdById === actor.userId;
  if (!assigned && !author && !actor.permissions.has("task.read.all")) {
    throw new BusinessError("ამ ფაილის ნახვის უფლება არ გაქვთ", "forbidden");
  }
  return { fileName: file.fileName, contentType: file.contentType, bytes: await readTaskBytes(file.storageKey) };
}

export async function rescheduleTask(actor: Actor, taskId: string, dueOn: string | null) {
  requirePermission(actor, "crm.write");
  const task = await getDb().task.findFirst({ where: { id: taskId, organizationId: actor.organizationId } });
  if (!task) throw new BusinessError("დავალება ვერ მოიძებნა", "not_found");
  if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) throw new BusinessError("თარიღის ფორმატი უნდა იყოს YYYY-MM-DD", "validation");
  return getDb().task.update({ where: { id: task.id }, data: { dueOn: dueOn ? parseDateOnly(dueOn) : null } });
}

export async function mergeCustomers(actor: Actor, targetId: string, sourceId: string) {
  requirePermission(actor, "crm.write");
  if (targetId === sourceId) throw new BusinessError("ერთი და იგივე ჩანაწერის შერწყმა ვერ მოხდება", "validation");
  return withTx(async (tx) => moveCustomerGraph(tx, actor, targetId, sourceId));
}

async function moveCustomerGraph(tx: Tx, actor: Actor, targetId: string, sourceId: string) {
  const target = await tx.customer.findFirst({ where: { id: targetId, organizationId: actor.organizationId, mergedIntoId: null } });
  const source = await tx.customer.findFirst({ where: { id: sourceId, organizationId: actor.organizationId, mergedIntoId: null } });
  if (!target || !source) throw new BusinessError("შერწყმის ჩანაწერი ვერ მოიძებნა", "not_found");
  await tx.contact.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
  await tx.address.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
  await tx.activity.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
  await tx.task.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
  await tx.quote.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
  await tx.salesOrder.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
  await tx.invoice.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
  await tx.payment.updateMany({ where: { customerId: sourceId }, data: { customerId: targetId } });
  await tx.customer.update({ where: { id: sourceId }, data: { mergedIntoId: targetId } });
  await audit(tx, actor, "customer.merge", "customer", targetId, { sourceId }, { targetId });
  return target;
}

export async function myDay(actor: Actor, now = new Date()) {
  const today = tbilisiDateString(now);
  const tasks = await getDb().task.findMany({
    where: {
      organizationId: actor.organizationId,
      status: "open",
      ...(actor.permissions.has("task.read.all") ? {} : { assignments: { some: { userId: actor.userId } } }),
      OR: [{ dueOn: null }, { dueOn: { lte: parseDateOnly(today) } }],
    },
    include: { customer: true },
    orderBy: { dueOn: "asc" },
  });
  const contacts = actor.permissions.has("crm.read")
    ? await getDb().customer.findMany({
        where: {
          organizationId: actor.organizationId,
          mergedIntoId: null,
          doNotContact: false,
          nextContactOn: { lte: parseDateOnly(today) },
        },
        orderBy: { nextContactOn: "asc" },
      })
    : [];
  return { today, tasks, contacts };
}

export async function searchRecords(actor: Actor, query: string) {
  requirePermission(actor, "crm.read");
  const q = query.trim();
  if (!q) return { customers: [], variants: [], orders: [], invoices: [] };
  const phone = normalizePhone(q);
  const [customers, variants, orders, invoices] = await Promise.all([
    getDb().customer.findMany({
      where: {
        organizationId: actor.organizationId,
        mergedIntoId: null,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { identificationCode: { contains: q } },
          ...(phone ? [{ phoneNormalized: phone }] : []),
          { phone: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { district: { contains: q, mode: "insensitive" } },
          { venueType: { contains: q, mode: "insensitive" } },
          { website: { contains: q, mode: "insensitive" } },
          { addresses: { some: { line1: { contains: q, mode: "insensitive" } } } },
        ],
      },
      take: 40,
    }),
    getDb().productVariant.findMany({
      where: { organizationId: actor.organizationId, OR: [{ sku: { contains: q, mode: "insensitive" } }, { nameKa: { contains: q, mode: "insensitive" } }] },
      take: 20,
    }),
    getDb().salesOrder.findMany({ where: { organizationId: actor.organizationId, number: { contains: q, mode: "insensitive" } }, take: 20 }),
    actor.permissions.has("finance.read")
      ? getDb().invoice.findMany({ where: { organizationId: actor.organizationId, number: { contains: q, mode: "insensitive" } }, take: 20 })
      : Promise.resolve([]),
  ]);
  return { customers, variants, orders, invoices };
}
