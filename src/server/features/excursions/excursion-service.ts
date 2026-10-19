import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { getDb, type Tx } from "@/server/db";
import { BusinessError } from "@/server/errors";
import { createManualInvoice } from "@/server/features/finance/invoice-service";
import { changeBalance, consumeReservation, releaseReservation, reserveQuantity } from "@/server/features/inventory/stock-service";
import { D, Decimal, roundMoney } from "@/server/money";
import { nextNumber } from "@/server/numbers";
import { withinWindow } from "@/server/time";
import { withTx } from "@/server/tx";

export async function createProgram(
  actor: Actor,
  input: { nameKa: string; durationMinutes: number; pricePerChild: string; maxCapacity: number; variantId: string; qtyPerChild?: string },
) {
  requirePermission(actor, "excursion.write");
  return getDb().excursionProgram.create({
    data: {
      organizationId: actor.organizationId,
      nameKa: input.nameKa,
      durationMinutes: input.durationMinutes,
      pricePerChild: D(input.pricePerChild).toFixed(2),
      maxCapacity: input.maxCapacity,
      materials: { create: [{ variantId: input.variantId, qtyPerChild: D(input.qtyPerChild ?? "1").toFixed(3) }] },
    },
    include: { materials: true },
  });
}

export async function bookExcursion(
  actor: Actor,
  input: {
    customerId: string;
    programId: string;
    resourceId: string;
    startsAt: Date;
    endsAt: Date;
    plannedChildren: number;
    staffUserIds?: string[];
    windowException?: boolean;
    postingKey: string;
    billableBasis?: "planned" | "attended";
  },
) {
  requirePermission(actor, "excursion.write");
  if (input.windowException) requirePermission(actor, "admin.users");
  return withTx((tx) => bookExcursionTx(tx, actor, input));
}

async function bookExcursionTx(tx: Tx, actor: Actor, input: Parameters<typeof bookExcursion>[1]) {
  const existing = await tx.excursionBooking.findUnique({ where: { postingKey: input.postingKey } });
  if (existing) return existing;
  const program = await tx.excursionProgram.findFirst({
    where: { id: input.programId, organizationId: actor.organizationId },
    include: { materials: true },
  });
  if (!program) throw new BusinessError("პროგრამა ვერ მოიძებნა", "not_found");
  if (!input.windowException && !withinWindow(input.startsAt, input.endsAt, program.windowStart, program.windowEnd)) {
    throw new BusinessError("ჯგუფი 13:00–16:00 ფანჯარაში უნდა ჩაეტიოს", "outside_window");
  }
  if (input.plannedChildren > program.maxCapacity) throw new BusinessError("ჯგუფი პროგრამის ტევადობას აჭარბებს", "capacity");
  await tx.$queryRaw`SELECT id FROM resources WHERE id = ${input.resourceId} FOR UPDATE`;
  const resource = await tx.resource.findFirst({ where: { id: input.resourceId, organizationId: actor.organizationId } });
  if (!resource) throw new BusinessError("სივრცე ვერ მოიძებნა", "not_found");
  const overlapping = await tx.resourceReservation.count({
    where: {
      resourceId: resource.id,
      status: { in: ["held", "confirmed"] },
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
  });
  if (overlapping >= resource.capacity) throw new BusinessError("ამ დროს სივრცე დაკავებულია", "capacity");
  for (const userId of input.staffUserIds ?? []) {
    const clash = await tx.staffAssignment.findFirst({
      where: { userId, startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } },
    });
    if (clash) throw new BusinessError("თანამშრომელი ამ დროს უკვე დაკავებულია", "staff_overlap");
  }
  const sales = await tx.location.findUniqueOrThrow({
    where: { organizationId_code: { organizationId: actor.organizationId, code: "sales" } },
  });
  const number = await nextNumber(tx, actor.organizationId, "excursion", "EX");
  const booking = await tx.excursionBooking.create({
    data: {
      organizationId: actor.organizationId,
      number,
      customerId: input.customerId,
      programId: program.id,
      resourceId: resource.id,
      status: "confirmed",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      plannedChildren: input.plannedChildren,
      billableBasis: input.billableBasis ?? "attended",
      windowException: input.windowException ?? false,
      postingKey: input.postingKey,
      staff: {
        create: (input.staffUserIds ?? []).map((userId) => ({
          userId,
          roleCode: "assistant",
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        })),
      },
      resourceHolds: {
        create: [{ resourceId: resource.id, status: "confirmed", startsAt: input.startsAt, endsAt: input.endsAt }],
      },
    },
  });
  for (const material of program.materials) {
    const quantity = D(material.qtyPerChild).mul(input.plannedChildren);
    await reserveQuantity(tx, {
      organizationId: actor.organizationId,
      variantId: material.variantId,
      locationId: sales.id,
      quantity,
      status: "confirmed",
      sourceType: "excursion",
      sourceId: booking.id,
      postingKey: `excursion-reserve:${booking.id}:${material.variantId}`,
    });
    await tx.materialUsage.create({
      data: { bookingId: booking.id, variantId: material.variantId, reserved: quantity.toFixed(3) },
    });
  }
  return booking;
}

export async function completeExcursion(actor: Actor, bookingId: string, attendedChildren: number) {
  requirePermission(actor, "excursion.write");
  return withTx(async (tx) => {
    const booking = await tx.excursionBooking.findFirst({
      where: { id: bookingId, organizationId: actor.organizationId },
      include: { materials: true, program: true },
    });
    if (!booking) throw new BusinessError("ჯავშანი ვერ მოიძებნა", "not_found");
    if (booking.status === "completed") return booking;
    const sales = await tx.location.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: actor.organizationId, code: "sales" } },
    });
    for (const material of booking.materials) {
      const perChild = D(material.reserved).div(booking.plannedChildren);
      const consumeQty = perChild.mul(attendedChildren);
      const releaseQty = D(material.reserved).minus(consumeQty);
      const reservation = await tx.reservation.findUnique({
        where: { postingKey: `excursion-reserve:${booking.id}:${material.variantId}` },
      });
      if (!reservation) throw new BusinessError("მასალის რეზერვი ვერ მოიძებნა", "not_found");
      if (releaseQty.gt(0)) {
        await changeBalance(tx, {
          organizationId: actor.organizationId,
          variantId: material.variantId,
          locationId: sales.id,
          onHandDelta: new Decimal(0),
          reservedDelta: releaseQty.neg(),
        });
        await tx.reservation.update({ where: { id: reservation.id }, data: { quantity: consumeQty.toFixed(3) } });
      }
      const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: material.variantId } });
      await consumeReservation(tx, reservation.id, {
        quantity: consumeQty,
        unitCost: D(variant.averageCost),
        movementType: "excursion_consume",
        postingKey: `excursion-consume:${booking.id}:${material.variantId}`,
        sourceType: "excursion",
        sourceId: booking.id,
        actorId: actor.userId,
      });
      await tx.materialUsage.update({
        where: { id: material.id },
        data: { consumed: consumeQty.toFixed(3) },
      });
    }
    const basis = booking.billableBasis === "planned" ? booking.plannedChildren : attendedChildren;
    const total = roundMoney(D(booking.program.pricePerChild).mul(basis));
    await createManualInvoice(tx, actor, {
      postingKey: `invoice:excursion:${booking.id}`,
      customerId: booking.customerId,
      sourceType: "excursion",
      sourceId: booking.id,
      forceDraft: true,
      lines: [{ description: booking.program.nameKa, quantity: new Decimal(basis), unitPrice: D(booking.program.pricePerChild), lineTotal: total }],
    });
    return tx.excursionBooking.update({
      where: { id: booking.id },
      data: { status: "completed", attendedChildren, billableChildren: basis },
    });
  });
}

export async function assertStaffFree(tx: Tx, userId: string, startsAt: Date, endsAt: Date): Promise<void> {
  const clash = await tx.staffAssignment.findFirst({
    where: { userId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
  });
  if (clash) throw new BusinessError("თანამშრომელი ამ დროს უკვე დაკავებულია", "staff_overlap");
}
