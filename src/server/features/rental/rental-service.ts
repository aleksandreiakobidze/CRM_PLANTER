import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { getDb, type Tx } from "@/server/db";
import { BusinessError, isExclusionViolation } from "@/server/errors";
import { recordDeposit } from "@/server/features/finance/payment-service";
import { nextInternalCode } from "@/server/features/catalog/internal-code";
import { transferQuantity } from "@/server/features/inventory/stock-service";
import { D, Decimal, priceFromTarget, roundMoney } from "@/server/money";
import { nextNumber } from "@/server/numbers";
import { inclusiveDays, rentalOccupancy } from "@/server/time";
import { withTx } from "@/server/tx";

export function rentalBillingDays(startOn: string, endOn: string): number {
  return inclusiveDays(startOn, endOn);
}

export async function createRentalAsset(actor: Actor, input: { variantId: string; code: string; fromLocationCode?: string }) {
  requirePermission(actor, "rental.write");
  return withTx(async (tx) => {
    const variant = await tx.productVariant.findFirst({ where: { id: input.variantId, organizationId: actor.organizationId } });
    if (!variant) throw new BusinessError("ვარიანტი ვერ მოიძებნა", "not_found");
    const internalCode = await nextInternalCode(tx, actor.organizationId, "asset");
    const code = input.code.trim() || internalCode;
    if (await tx.rentalAsset.findFirst({ where: { organizationId: actor.organizationId, code }, select: { id: true } })) {
      throw new BusinessError("ეს კოდი უკვე არსებობს", "validation");
    }
    const from = await tx.location.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: actor.organizationId, code: input.fromLocationCode ?? "sales" } },
    });
    const pool = await tx.location.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: actor.organizationId, code: "rental_pool" } },
    });
    await transferQuantity(tx, {
      organizationId: actor.organizationId,
      variantId: variant.id,
      fromLocationId: from.id,
      toLocationId: pool.id,
      quantity: new Decimal(1),
      unitCost: D(variant.averageCost),
      postingKey: `asset-fund:${actor.organizationId}:${code}`,
      sourceType: "rental_asset",
      sourceId: code,
      actorId: actor.userId,
    });
    return tx.rentalAsset.create({
      data: {
        organizationId: actor.organizationId,
        code,
        internalCode,
        variantId: variant.id,
        locationId: pool.id,
        status: "available",
        unitCost: D(variant.averageCost).toFixed(4),
      },
    });
  });
}

export async function bookRental(
  actor: Actor,
  input: {
    customerId: string;
    assetIds: string[];
    lines?: { assetId: string; unitPrice: string }[];
    startOn: string;
    endOn: string;
    priceModel: "fixed_total" | "daily" | "line";
    total?: string;
    dailyRate?: string;
    depositAmount?: string;
    postingKey: string;
  },
) {
  requirePermission(actor, "rental.write");
  const assetIds = input.lines?.length ? input.lines.map((line) => line.assetId) : input.assetIds;
  if (assetIds.length === 0) throw new BusinessError("ჯავშანს კონკრეტული მცენარე სჭირდება", "validation");
  if (new Set(assetIds).size !== assetIds.length) throw new BusinessError("ერთი მცენარე ორჯერ არ იწერება", "validation");
  input = { ...input, assetIds, priceModel: input.lines?.length ? "line" : input.priceModel };
  try {
    return await withTx((tx) => bookRentalTx(tx, actor, input));
  } catch (error) {
    if (isExclusionViolation(error)) throw new BusinessError("ეს მცენარე არჩეულ პერიოდში უკვე დაკავებულია", "overlap");
    throw error;
  }
}

async function bookRentalTx(tx: Tx, actor: Actor, input: Parameters<typeof bookRental>[1]) {
  const existing = await tx.rentalBooking.findUnique({ where: { postingKey: input.postingKey } });
  if (existing) return existing;
  const organization = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
  const days = rentalBillingDays(input.startOn, input.endOn);
  const occupancy = rentalOccupancy(input.startOn, input.endOn, organization.rentalBufferHours);
  const priced = priceRental(input, days);
  const lineTotal = input.lines?.length
    ? input.lines.reduce((sum, line) => sum.plus(roundMoney(D(line.unitPrice))), D(0))
    : priced.total;
  const number = await nextNumber(tx, actor.organizationId, "rental", "RB");
  const booking = await tx.rentalBooking.create({
    data: {
      organizationId: actor.organizationId,
      number,
      customerId: input.customerId,
      status: "confirmed",
      startOn: new Date(`${input.startOn}T00:00:00.000Z`),
      endOn: new Date(`${input.endOn}T00:00:00.000Z`),
      billingDays: days,
      occupancyStart: occupancy.occupancyStart,
      occupancyEnd: occupancy.occupancyEnd,
      priceModel: input.priceModel,
      total: lineTotal.toFixed(2),
      depositAmount: D(input.depositAmount ?? "0").toFixed(2),
      postingKey: input.postingKey,
    },
  });
  for (const assetId of input.assetIds) {
    await tx.$queryRaw`SELECT id FROM rental_assets WHERE id = ${assetId} AND organization_id = ${actor.organizationId} FOR UPDATE`;
    const asset = await tx.rentalAsset.findFirst({ where: { id: assetId, organizationId: actor.organizationId } });
    if (!asset || asset.status === "damaged" || asset.status === "lost") {
      throw new BusinessError("მცენარე გაქირავებისთვის ხელმისაწვდომი არ არის", "unavailable");
    }
    const overlap = await tx.assetReservation.findFirst({
      where: {
        assetId,
        status: { in: ["held", "confirmed"] },
        occupancyStart: { lt: occupancy.occupancyEnd },
        occupancyEnd: { gt: occupancy.occupancyStart },
      },
    });
    if (overlap) throw new BusinessError("ეს მცენარე არჩეულ პერიოდში უკვე დაკავებულია", "overlap");
    await tx.assetReservation.create({
      data: {
        organizationId: actor.organizationId,
        assetId,
        bookingId: booking.id,
        status: "confirmed",
        occupancyStart: occupancy.occupancyStart,
        occupancyEnd: occupancy.occupancyEnd,
        postingKey: `${input.postingKey}:${assetId}`,
      },
    });
    const own = input.lines?.find((line) => line.assetId === assetId);
    const unitPrice = own ? D(own.unitPrice) : priced.unitPrice;
    const lineTotal = own ? roundMoney(unitPrice) : priced.lineTotal;
    if (unitPrice.lt(0)) throw new BusinessError("ფასი უარყოფითი ვერ იქნება", "validation");
    await tx.rentalBookingLine.create({
      data: {
        bookingId: booking.id,
        assetId,
        unitPrice: unitPrice.toFixed(4),
        lineTotal: lineTotal.toFixed(2),
      },
    });
    await tx.rentalAsset.update({ where: { id: assetId }, data: { status: "reserved" } });
  }
  const deposit = D(input.depositAmount ?? "0");
  if (deposit.gt(0)) {
    await recordDeposit(tx, {
      organizationId: actor.organizationId,
      bookingId: booking.id,
      amount: deposit,
      postingKey: `${input.postingKey}:deposit`,
      kind: "hold",
    });
  }
  return booking;
}

function priceRental(input: Parameters<typeof bookRental>[1], days: number): { total: Decimal; unitPrice: Decimal; lineTotal: Decimal } {
  if (input.priceModel === "fixed_total") {
    if (!input.total) throw new BusinessError("ჯამური ფასი სავალდებულოა", "validation");
    const target = D(input.total);
    const priced = priceFromTarget(new Decimal(input.assetIds.length || 1), target);
    return { total: target, unitPrice: priced.unitPrice, lineTotal: roundMoney(target.div(input.assetIds.length || 1)) };
  }
  const rate = D(input.dailyRate ?? "0");
  const line = roundMoney(rate.mul(days));
  return { total: roundMoney(line.mul(input.assetIds.length)), unitPrice: rate, lineTotal: line };
}

export async function deliverRental(actor: Actor, bookingId: string) {
  requirePermission(actor, "rental.write");
  return withTx(async (tx) => {
    const booking = await tx.rentalBooking.findFirst({
      where: { id: bookingId, organizationId: actor.organizationId },
      include: { lines: { include: { asset: true } } },
    });
    if (!booking) throw new BusinessError("ჯავშანი ვერ მოიძებნა", "not_found");
    if (booking.status === "out" || booking.status === "returned") return booking;
    const site = await tx.location.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: actor.organizationId, code: "customer_site" } },
    });
    for (const line of booking.lines) {
      await transferQuantity(tx, {
        organizationId: actor.organizationId,
        variantId: line.asset.variantId,
        fromLocationId: line.asset.locationId,
        toLocationId: site.id,
        quantity: new Decimal(1),
        unitCost: D(line.asset.unitCost),
        postingKey: `rental-out:${booking.id}:${line.assetId}`,
        sourceType: "rental_delivery",
        sourceId: booking.id,
        actorId: actor.userId,
      });
      await tx.rentalAsset.update({ where: { id: line.assetId }, data: { locationId: site.id, status: "on_rent" } });
    }
    return tx.rentalBooking.update({ where: { id: booking.id }, data: { status: "out" } });
  });
}

export async function returnRentalAssets(
  actor: Actor,
  input: { bookingId: string; assets: { assetId: string; condition: "healthy" | "damaged" | "lost" }[] },
) {
  requirePermission(actor, "rental.write");
  return withTx(async (tx) => {
    const booking = await tx.rentalBooking.findFirst({
      where: { id: input.bookingId, organizationId: actor.organizationId },
      include: { lines: true, reservations: true },
    });
    if (!booking) throw new BusinessError("ჯავშანი ვერ მოიძებნა", "not_found");
    const pool = await tx.location.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: actor.organizationId, code: "rental_pool" } },
    });
    const quarantine = await tx.location.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: actor.organizationId, code: "quarantine" } },
    });
    for (const item of input.assets) {
      const asset = await tx.rentalAsset.findFirst({ where: { id: item.assetId, organizationId: actor.organizationId } });
      if (!asset) throw new BusinessError("მცენარე ვერ მოიძებნა", "not_found");
      const destination = item.condition === "healthy" ? pool : quarantine;
      const status = item.condition === "healthy" ? "available" : item.condition === "lost" ? "lost" : "damaged";
      if (item.condition !== "lost") {
        await transferQuantity(tx, {
          organizationId: actor.organizationId,
          variantId: asset.variantId,
          fromLocationId: asset.locationId,
          toLocationId: destination.id,
          quantity: new Decimal(1),
          unitCost: D(asset.unitCost),
          postingKey: `rental-in:${booking.id}:${asset.id}:${item.condition}`,
          sourceType: "rental_return",
          sourceId: booking.id,
          actorId: actor.userId,
        });
      }
      await tx.rentalAsset.update({
        where: { id: asset.id },
        data: { status, locationId: item.condition === "lost" ? asset.locationId : destination.id },
      });
      await tx.assetReservation.updateMany({
        where: { bookingId: booking.id, assetId: asset.id, status: "confirmed" },
        data: { status: "released" },
      });
    }
    const stillOut = await tx.rentalAsset.count({
      where: { id: { in: booking.lines.map((line) => line.assetId) }, status: "on_rent" },
    });
    return tx.rentalBooking.update({
      where: { id: booking.id },
      data: { status: stillOut === 0 ? "returned" : "partially_returned" },
    });
  });
}

export async function rentalRevenue(organizationId: string): Promise<string> {
  const bookings = await getDb().rentalBooking.findMany({
    where: { organizationId, status: { in: ["confirmed", "out", "returned", "partially_returned"] } },
  });
  return roundMoney(bookings.reduce((sum, row) => sum.plus(D(row.total)), new Decimal(0))).toFixed(2);
}
