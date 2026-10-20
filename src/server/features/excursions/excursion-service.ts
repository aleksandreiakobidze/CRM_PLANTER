import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { type Tx } from "@/server/db";
import { BusinessError } from "@/server/errors";
import { createManualInvoice } from "@/server/features/finance/invoice-service";
import { changeBalance, consumeReservation } from "@/server/features/inventory/stock-service";
import { D, Decimal, roundMoney } from "@/server/money";
import { nextNumber } from "@/server/numbers";
import { withinWindow } from "@/server/time";
import { withTx } from "@/server/tx";

export async function bookExcursion(
  actor: Actor,
  input: {
    customerId: string;
    resourceId: string;
    startsAt: Date;
    endsAt: Date;
    plannedChildren: number;
    note: string;
    price: string;
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
  const note = input.note.trim();
  if (!note) throw new BusinessError("შენიშვნა ჩაწერეთ", "validation");
  const price = roundMoney(D(input.price));
  if (!price.isFinite() || price.lte(0)) throw new BusinessError("ფასი ნულზე მეტი უნდა იყოს", "validation");
  const organization = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
  if (!input.windowException && !withinWindow(input.startsAt, input.endsAt, organization.excursionWindowStart, organization.excursionWindowEnd)) {
    throw new BusinessError("ჯგუფი 13:00–16:00 ფანჯარაში უნდა ჩაეტიოს", "outside_window");
  }
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
  const number = await nextNumber(tx, actor.organizationId, "excursion", "EX");
  return tx.excursionBooking.create({
    data: {
      organizationId: actor.organizationId,
      number,
      customerId: input.customerId,
      resourceId: resource.id,
      status: "confirmed",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      note,
      price: price.toFixed(2),
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
    if (booking.program && booking.materials.length > 0) {
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
    }
    const total = roundMoney(D(booking.price));
    await createManualInvoice(tx, actor, {
      postingKey: `invoice:excursion:${booking.id}`,
      customerId: booking.customerId,
      sourceType: "excursion",
      sourceId: booking.id,
      forceDraft: true,
      lines: [{ description: booking.note.trim() || "ექსკურსია", quantity: new Decimal(1), unitPrice: total, lineTotal: total }],
    });
    return tx.excursionBooking.update({
      where: { id: booking.id },
      data: { status: "completed", attendedChildren, billableChildren: attendedChildren },
    });
  });
}

export async function assertStaffFree(tx: Tx, userId: string, startsAt: Date, endsAt: Date): Promise<void> {
  const clash = await tx.staffAssignment.findFirst({
    where: { userId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
  });
  if (clash) throw new BusinessError("თანამშრომელი ამ დროს უკვე დაკავებულია", "staff_overlap");
}
