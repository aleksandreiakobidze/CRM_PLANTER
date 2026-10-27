import { randomUUID } from "crypto";
import { can, requirePermission, type Actor } from "@/server/auth/permissions";
import { getDb, isMysql, type Tx } from "@/server/db";
import { BusinessError, isUniqueViolation } from "@/server/errors";
import { D, Decimal } from "@/server/money";
import { SELLABLE_LOCATION_KINDS } from "@/server/org";
import { withTx } from "@/server/tx";

type MovementInput = {
  quantity: Decimal;
  unitCost: Decimal;
  movementType: string;
  postingKey: string;
  sourceType: string;
  sourceId: string;
  reason?: string;
  actorId?: string;
};

async function lockBalance(tx: Tx, organizationId: string, variantId: string, locationId: string) {
  if (isMysql()) {
    await tx.$executeRaw`
      INSERT INTO stock_balances (id, organization_id, variant_id, location_id, on_hand, reserved)
      VALUES (${randomUUID()}, ${organizationId}, ${variantId}, ${locationId}, 0, 0)
      ON DUPLICATE KEY UPDATE id = id
    `;
  } else {
    await tx.$executeRaw`
      INSERT INTO stock_balances (id, organization_id, variant_id, location_id, on_hand, reserved)
      VALUES (${randomUUID()}, ${organizationId}, ${variantId}, ${locationId}, 0, 0)
      ON CONFLICT (organization_id, variant_id, location_id) DO NOTHING
    `;
  }
  await tx.$queryRaw`
    SELECT id FROM stock_balances
    WHERE organization_id = ${organizationId}
      AND variant_id = ${variantId}
      AND location_id = ${locationId}
    FOR UPDATE
  `;
  return tx.stockBalance.findUniqueOrThrow({
    where: { organizationId_variantId_locationId: { organizationId, variantId, locationId } },
  });
}

export async function changeBalance(
  tx: Tx,
  input: {
    organizationId: string;
    variantId: string;
    locationId: string;
    onHandDelta: Decimal;
    reservedDelta: Decimal;
    movement?: MovementInput;
  },
) {
  if (input.movement) {
    const existing = await tx.stockMovement.findUnique({ where: { postingKey: input.movement.postingKey } });
    if (existing) return { skipped: true as const, movement: existing };
  }
  const balance = await lockBalance(tx, input.organizationId, input.variantId, input.locationId);
  const onHand = D(balance.onHand).plus(input.onHandDelta);
  const reserved = D(balance.reserved).plus(input.reservedDelta);
  if (onHand.lt(0) || reserved.lt(0) || reserved.gt(onHand)) {
    throw new BusinessError("ნაშთი საკმარისი არ არის", "insufficient_stock");
  }
  await tx.stockBalance.update({
    where: { id: balance.id },
    data: { onHand: onHand.toFixed(3), reserved: reserved.toFixed(3) },
  });
  if (!input.movement) return { skipped: false as const, movement: null };
  const movement = await tx.stockMovement.create({
    data: {
      organizationId: input.organizationId,
      variantId: input.variantId,
      locationId: input.locationId,
      quantity: input.movement.quantity.toFixed(3),
      unitCost: input.movement.unitCost.toFixed(4),
      movementType: input.movement.movementType,
      postingKey: input.movement.postingKey,
      sourceType: input.movement.sourceType,
      sourceId: input.movement.sourceId,
      reason: input.movement.reason,
      actorId: input.movement.actorId,
    },
  });
  return { skipped: false as const, movement };
}

export async function postOpeningStock(
  actor: Actor,
  input: { variantId: string; locationId: string; quantity: string; unitCost: string; postingKey: string; reason?: string },
) {
  requirePermission(actor, "stock.write");
  const quantity = D(input.quantity);
  const unitCost = D(input.unitCost);
  if (quantity.lte(0)) throw new BusinessError("რაოდენობა ნულზე მეტი უნდა იყოს", "validation");
  try {
    return await withTx((tx) => postOpeningStockTx(tx, actor, { ...input, quantity, unitCost }));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().stockMovement.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

export async function postOpeningStockTx(
  tx: Tx,
  actor: Actor,
  input: { variantId: string; locationId: string; quantity: Decimal; unitCost: Decimal; postingKey: string; reason?: string },
) {
  const variant = await tx.productVariant.findFirst({
    where: { id: input.variantId, organizationId: actor.organizationId },
  });
  if (!variant) throw new BusinessError("ვარიანტი ვერ მოიძებნა", "not_found");
  const balance = await lockBalance(tx, actor.organizationId, input.variantId, input.locationId);
  const currentQty = D(balance.onHand);
  const nextQty = currentQty.plus(input.quantity);
  const average = nextQty.eq(0)
    ? input.unitCost
    : currentQty.mul(D(variant.averageCost)).plus(input.quantity.mul(input.unitCost)).div(nextQty);
  const result = await changeBalance(tx, {
    organizationId: actor.organizationId,
    variantId: input.variantId,
    locationId: input.locationId,
    onHandDelta: input.quantity,
    reservedDelta: new Decimal(0),
    movement: {
      quantity: input.quantity,
      unitCost: input.unitCost,
      movementType: "opening",
      postingKey: input.postingKey,
      sourceType: "opening",
      sourceId: input.postingKey,
      reason: input.reason ?? "საწყისი ნაშთი",
      actorId: actor.userId,
    },
  });
  if (!result.skipped) {
    await tx.productVariant.update({
      where: { id: variant.id },
      data: { averageCost: average.toFixed(4), unitCost: input.unitCost.toFixed(4) },
    });
  }
  return result.movement;
}

export async function listBalances(actor: Actor) {
  requirePermission(actor, "stock.read");
  const showCost = can(actor, "stock.cost.read");
  const rows = await getDb().stockBalance.findMany({
    where: { organizationId: actor.organizationId },
    include: { variant: true, location: true },
    orderBy: [{ variant: { sku: "asc" } }, { location: { code: "asc" } }],
  });
  return rows.map((row) => {
    const available = D(row.onHand).minus(row.reserved);
    const item: {
      id: string;
      code: string;
      sku: string;
      name: string;
      location: string;
      locationKind: string;
      onHand: string;
      reserved: string;
      available: string;
      sellable: string;
      unitCost?: string;
    } = {
      id: row.id,
      code: row.variant.internalCode ?? "",
      sku: row.variant.sku,
      name: row.variant.nameKa,
      location: row.location.nameKa,
      locationKind: row.location.kind,
      onHand: D(row.onHand).toFixed(3),
      reserved: D(row.reserved).toFixed(3),
      available: available.toFixed(3),
      sellable: SELLABLE_LOCATION_KINDS.has(row.location.kind) ? available.toFixed(3) : "0.000",
    };
    if (showCost) item.unitCost = D(row.variant.averageCost).toFixed(4);
    return item;
  });
}

export async function reserveQuantity(
  tx: Tx,
  input: {
    organizationId: string;
    variantId: string;
    locationId: string;
    quantity: Decimal;
    status: "held" | "confirmed";
    sourceType: string;
    sourceId: string;
    postingKey: string;
    expiresAt?: Date | null;
  },
) {
  const existing = await tx.reservation.findUnique({ where: { postingKey: input.postingKey } });
  if (existing) return existing;
  await changeBalance(tx, {
    organizationId: input.organizationId,
    variantId: input.variantId,
    locationId: input.locationId,
    onHandDelta: new Decimal(0),
    reservedDelta: input.quantity,
  });
  return tx.reservation.create({
    data: {
      organizationId: input.organizationId,
      variantId: input.variantId,
      locationId: input.locationId,
      quantity: input.quantity.toFixed(3),
      status: input.status,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      postingKey: input.postingKey,
      expiresAt: input.expiresAt ?? null,
    },
  });
}

export async function releaseReservation(tx: Tx, reservationId: string, nextStatus: "released" | "expired") {
  const reservation = await tx.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation || reservation.status === nextStatus || reservation.status === "released" || reservation.status === "consumed" || reservation.status === "expired") {
    return false;
  }
  if (nextStatus === "expired" && reservation.status !== "held") return false;
  const updated = await tx.reservation.updateMany({
    where: { id: reservationId, status: reservation.status },
    data: { status: nextStatus },
  });
  if (updated.count !== 1) return false;
  await changeBalance(tx, {
    organizationId: reservation.organizationId,
    variantId: reservation.variantId,
    locationId: reservation.locationId,
    onHandDelta: new Decimal(0),
    reservedDelta: D(reservation.quantity).neg(),
  });
  return true;
}

export async function consumeReservation(
  tx: Tx,
  reservationId: string,
  movement: Omit<MovementInput, "quantity"> & { quantity?: Decimal },
) {
  const reservation = await tx.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation) throw new BusinessError("რეზერვი ვერ მოიძებნა", "not_found");
  if (reservation.status === "consumed") return false;
  if (reservation.status !== "confirmed" && reservation.status !== "held") {
    throw new BusinessError("რეზერვი უკვე დახურულია", "invalid_state");
  }
  const quantity = movement.quantity ?? D(reservation.quantity);
  await tx.reservation.update({ where: { id: reservation.id }, data: { status: "consumed" } });
  await changeBalance(tx, {
    organizationId: reservation.organizationId,
    variantId: reservation.variantId,
    locationId: reservation.locationId,
    onHandDelta: quantity.neg(),
    reservedDelta: quantity.neg(),
    movement: { ...movement, quantity: quantity.neg() },
  });
  return true;
}

export async function transferQuantity(
  tx: Tx,
  input: {
    organizationId: string;
    variantId: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: Decimal;
    unitCost: Decimal;
    postingKey: string;
    sourceType: string;
    sourceId: string;
    actorId?: string;
  },
) {
  const outKey = `${input.postingKey}:out`;
  const inKey = `${input.postingKey}:in`;
  await changeBalance(tx, {
    organizationId: input.organizationId,
    variantId: input.variantId,
    locationId: input.fromLocationId,
    onHandDelta: input.quantity.neg(),
    reservedDelta: new Decimal(0),
    movement: {
      quantity: input.quantity.neg(),
      unitCost: input.unitCost,
      movementType: "transfer_out",
      postingKey: outKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      actorId: input.actorId,
    },
  });
  await changeBalance(tx, {
    organizationId: input.organizationId,
    variantId: input.variantId,
    locationId: input.toLocationId,
    onHandDelta: input.quantity,
    reservedDelta: new Decimal(0),
    movement: {
      quantity: input.quantity,
      unitCost: input.unitCost,
      movementType: "transfer_in",
      postingKey: inKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      actorId: input.actorId,
    },
  });
}

export async function expireHeldReservations(now = new Date()): Promise<number> {
  const held = await getDb().reservation.findMany({
    where: { status: "held", expiresAt: { lt: now } },
  });
  let expired = 0;
  for (const reservation of held) {
    const did = await withTx((tx) => releaseReservation(tx, reservation.id, "expired"));
    if (did) expired += 1;
  }
  return expired;
}

export async function companyOnHand(organizationId: string, variantId: string): Promise<Decimal> {
  const rows = await getDb().stockBalance.findMany({ where: { organizationId, variantId } });
  return rows.reduce((sum, row) => sum.plus(D(row.onHand)), new Decimal(0));
}

export async function receiveIntoStock(
  tx: Tx,
  actor: Actor,
  input: {
    variantId: string;
    locationId: string;
    quantity: Decimal;
    unitCost: Decimal;
    postingKey: string;
    movementType: string;
    sourceType: string;
    sourceId: string;
    reason?: string;
  },
) {
  const variant = await tx.productVariant.findFirst({
    where: { id: input.variantId, organizationId: actor.organizationId },
  });
  if (!variant) throw new BusinessError("ვარიანტი ვერ მოიძებნა", "not_found");
  const balance = await lockBalance(tx, actor.organizationId, input.variantId, input.locationId);
  const currentQty = D(balance.onHand);
  const nextQty = currentQty.plus(input.quantity);
  const average = nextQty.eq(0)
    ? input.unitCost
    : currentQty.mul(D(variant.averageCost)).plus(input.quantity.mul(input.unitCost)).div(nextQty);
  const result = await changeBalance(tx, {
    organizationId: actor.organizationId,
    variantId: input.variantId,
    locationId: input.locationId,
    onHandDelta: input.quantity,
    reservedDelta: new Decimal(0),
    movement: {
      quantity: input.quantity,
      unitCost: input.unitCost,
      movementType: input.movementType,
      postingKey: input.postingKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reason: input.reason,
      actorId: actor.userId,
    },
  });
  if (!result.skipped) {
    await tx.productVariant.update({
      where: { id: variant.id },
      data: { averageCost: average.toFixed(4), unitCost: input.unitCost.toFixed(4) },
    });
  }
  return result;
}

export async function issueFromStock(
  tx: Tx,
  actor: Actor,
  input: {
    variantId: string;
    locationId: string;
    quantity: Decimal;
    postingKey: string;
    movementType: string;
    sourceType: string;
    sourceId: string;
    reason?: string;
  },
) {
  const variant = await tx.productVariant.findFirst({
    where: { id: input.variantId, organizationId: actor.organizationId },
  });
  if (!variant) throw new BusinessError("ვარიანტი ვერ მოიძებნა", "not_found");
  return changeBalance(tx, {
    organizationId: actor.organizationId,
    variantId: input.variantId,
    locationId: input.locationId,
    onHandDelta: input.quantity.neg(),
    reservedDelta: new Decimal(0),
    movement: {
      quantity: input.quantity.neg(),
      unitCost: D(variant.averageCost),
      movementType: input.movementType,
      postingKey: input.postingKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reason: input.reason,
      actorId: actor.userId,
    },
  });
}

export async function applyAverageCostAdjustment(tx: Tx, organizationId: string, variantId: string, extraAmount: Decimal) {
  if (extraAmount.eq(0)) return;
  const variant = await tx.productVariant.findFirst({ where: { id: variantId, organizationId } });
  if (!variant) throw new BusinessError("ვარიანტი ვერ მოიძებნა", "not_found");
  const rows = await tx.stockBalance.findMany({ where: { organizationId, variantId } });
  const onHand = rows.reduce((sum, row) => sum.plus(D(row.onHand)), new Decimal(0));
  if (onHand.lte(0)) return;
  const nextAvg = D(variant.averageCost).plus(extraAmount.div(onHand));
  await tx.productVariant.update({
    where: { id: variant.id },
    data: { averageCost: nextAvg.toFixed(4) },
  });
}

export async function transferStock(
  actor: Actor,
  input: {
    variantId: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: string;
    postingKey: string;
  },
) {
  requirePermission(actor, "stock.write");
  const quantity = D(input.quantity);
  if (quantity.lte(0)) throw new BusinessError("რაოდენობა ნულზე მეტი უნდა იყოს", "validation");
  if (input.fromLocationId === input.toLocationId) throw new BusinessError("ლოკაცია უნდა განსხვავდებოდეს", "validation");
  try {
    return await withTx(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: { id: input.variantId, organizationId: actor.organizationId },
      });
      if (!variant) throw new BusinessError("ვარიანტი ვერ მოიძებნა", "not_found");
      await transferQuantity(tx, {
        organizationId: actor.organizationId,
        variantId: input.variantId,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        quantity,
        unitCost: D(variant.averageCost),
        postingKey: input.postingKey,
        sourceType: "transfer",
        sourceId: input.postingKey,
        actorId: actor.userId,
      });
      return { postingKey: input.postingKey };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { postingKey: input.postingKey };
  }
}
