import type { Actor } from "@/server/auth/permissions";
import { can, requirePermission } from "@/server/auth/permissions";
import { audit } from "@/server/audit";
import { getDb } from "@/server/db";
import { BusinessError, isUniqueViolation } from "@/server/errors";
import { nextNumber } from "@/server/numbers";
import { parseDateOnly, tbilisiDateString } from "@/server/time";
import { withTx } from "@/server/tx";

const STATUSES = ["planned", "scheduled", "in_transit", "done", "failed"] as const;

export async function createDeliveryTask(
  actor: Actor,
  input: {
    sourceType: "order" | "rental" | "replacement" | "project";
    sourceId: string;
    customerId?: string;
    address: string;
    phone?: string;
    mapsUrl?: string;
    quantityNote?: string;
    instructions?: string;
    windowNote?: string;
    postingKey: string;
  },
) {
  requirePermission(actor, "delivery.write");
  const address = input.address.trim();
  if (!address) throw new BusinessError("მისამართი სავალდებულოა", "validation");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.deliveryTask.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
      const number = await nextNumber(tx, actor.organizationId, "delivery", "DL");
      const task = await tx.deliveryTask.create({
        data: {
          organizationId: actor.organizationId,
          number,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          customerId: input.customerId || null,
          address,
          phone: input.phone?.trim() || null,
          mapsUrl: input.mapsUrl?.trim() || null,
          quantityNote: input.quantityNote?.trim() || null,
          instructions: input.instructions?.trim() || null,
          windowNote: input.windowNote?.trim() || null,
          postingKey: input.postingKey,
        },
      });
      await audit(tx, actor, "delivery.create", "delivery_task", task.id);
      return task;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().deliveryTask.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

export async function setDeliveryStatus(actor: Actor, taskId: string, status: (typeof STATUSES)[number]) {
  requirePermission(actor, can(actor, "delivery.write") ? "delivery.write" : "delivery.read");
  if (!STATUSES.includes(status)) throw new BusinessError("სტატუსი უცნობია", "validation");
  if (!can(actor, "delivery.write") && status !== "done" && status !== "failed" && status !== "in_transit") {
    throw new BusinessError("ამ მოქმედების უფლება არ გაქვთ", "forbidden");
  }
  const task = await getDb().deliveryTask.findFirst({
    where: { id: taskId, organizationId: actor.organizationId },
  });
  if (!task) throw new BusinessError("დავალება ვერ მოიძებნა", "not_found");
  if (!can(actor, "delivery.write") && task.driverId && task.driverId !== actor.userId) {
    throw new BusinessError("ეს მარშრუტი სხვა მძღოლისაა", "forbidden");
  }
  return getDb().deliveryTask.update({ where: { id: task.id }, data: { status } });
}

export async function upsertRoute(actor: Actor, input: { date: string; driverId?: string; postingKey: string }) {
  requirePermission(actor, "delivery.write");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.route.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
      const date = parseDateOnly(input.date);
      const found = await tx.route.findFirst({
        where: { organizationId: actor.organizationId, date, driverId: input.driverId || null },
      });
      if (found) return found;
      return tx.route.create({
        data: {
          organizationId: actor.organizationId,
          date,
          driverId: input.driverId || null,
          postingKey: input.postingKey,
        },
      });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().route.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

export async function setRouteStops(actor: Actor, routeId: string, taskIds: string[]) {
  requirePermission(actor, "delivery.write");
  return withTx(async (tx) => {
    const route = await tx.route.findFirst({
      where: { id: routeId, organizationId: actor.organizationId },
    });
    if (!route) throw new BusinessError("მარშრუტი ვერ მოიძებნა", "not_found");
    await tx.routeStop.deleteMany({ where: { routeId: route.id } });
    for (const [index, taskId] of taskIds.entries()) {
      const task = await tx.deliveryTask.findFirst({
        where: { id: taskId, organizationId: actor.organizationId },
      });
      if (!task) throw new BusinessError("დავალება ვერ მოიძებნა", "not_found");
      await tx.routeStop.create({
        data: { routeId: route.id, deliveryTaskId: task.id, sort: index },
      });
      await tx.deliveryTask.update({
        where: { id: task.id },
        data: { status: task.status === "planned" ? "scheduled" : task.status, driverId: route.driverId },
      });
    }
    return tx.route.findUniqueOrThrow({
      where: { id: route.id },
      include: { stops: { include: { task: { include: { customer: true } } }, orderBy: { sort: "asc" } } },
    });
  });
}

export async function listDriverDay(actor: Actor, date = tbilisiDateString()) {
  requirePermission(actor, "delivery.read");
  const hideCost = !can(actor, "stock.cost.read") && !can(actor, "finance.read");
  const day = parseDateOnly(date);
  const routes = await getDb().route.findMany({
    where: {
      organizationId: actor.organizationId,
      date: day,
      ...(can(actor, "delivery.write") ? {} : { driverId: actor.userId }),
    },
    include: {
      stops: {
        orderBy: { sort: "asc" },
        include: { task: { include: { customer: true } } },
      },
    },
  });
  const unassigned = can(actor, "delivery.write")
    ? await getDb().deliveryTask.findMany({
        where: { organizationId: actor.organizationId, status: "planned" },
        include: { customer: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  return {
    hideCost,
    routes: routes.map((route) => ({
      id: route.id,
      date,
      status: route.status,
      driverId: route.driverId,
      stops: route.stops.map((stop) => publicTask(stop.task, hideCost, stop.sort)),
    })),
    unassigned: unassigned.map((task) => publicTask(task, hideCost, 0)),
  };
}

function publicTask(
  task: {
    id: string;
    number: string;
    status: string;
    address: string;
    phone: string | null;
    mapsUrl: string | null;
    quantityNote: string | null;
    instructions: string | null;
    windowNote: string | null;
    customer: { name: string } | null;
  },
  hideCost: boolean,
  sort: number,
) {
  return {
    id: task.id,
    number: task.number,
    status: task.status,
    address: task.address,
    phone: task.phone,
    mapsUrl: task.mapsUrl,
    quantityNote: task.quantityNote,
    instructions: task.instructions,
    windowNote: task.windowNote,
    customer: task.customer?.name ?? "",
    sort,
    ...(hideCost ? {} : { costHidden: false }),
  };
}
