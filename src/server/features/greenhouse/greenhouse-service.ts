import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { audit } from "@/server/audit";
import { getDb, type Tx } from "@/server/db";
import { BusinessError, isUniqueViolation } from "@/server/errors";
import { issueFromStock, receiveIntoStock } from "@/server/features/inventory/stock-service";
import { D, Decimal } from "@/server/money";
import { nextNumber } from "@/server/numbers";
import { parseDateOnly, tbilisiDateString } from "@/server/time";
import { withTx } from "@/server/tx";

const STAGES = ["received", "growing", "ready", "closed"] as const;

export async function createGrowthBatch(
  actor: Actor,
  input: {
    variantId: string;
    locationId?: string;
    supplierId?: string;
    quantity: string;
    expectedReadyOn?: string;
    receivedOn?: string;
    notes?: string;
    postingKey: string;
  },
) {
  requirePermission(actor, "stock.write");
  const quantity = D(input.quantity);
  if (quantity.lte(0)) throw new BusinessError("რაოდენობა ნულზე მეტი უნდა იყოს", "validation");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.growthBatch.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
      const location = input.locationId
        ? await tx.location.findFirst({ where: { id: input.locationId, organizationId: actor.organizationId } })
        : await tx.location.findUnique({
            where: { organizationId_code: { organizationId: actor.organizationId, code: "greenhouse" } },
          });
      if (!location) throw new BusinessError("სათბურის ლოკაცია ვერ მოიძებნა", "not_found");
      const variant = await tx.productVariant.findFirst({
        where: { id: input.variantId, organizationId: actor.organizationId },
      });
      if (!variant) throw new BusinessError("ვარიანტი ვერ მოიძებნა", "not_found");
      const number = await nextNumber(tx, actor.organizationId, "growth_batch", "GB");
      const batch = await tx.growthBatch.create({
        data: {
          organizationId: actor.organizationId,
          number,
          supplierId: input.supplierId || null,
          variantId: variant.id,
          locationId: location.id,
          quantity: quantity.toFixed(3),
          expectedReadyOn: input.expectedReadyOn ? parseDateOnly(input.expectedReadyOn) : null,
          receivedOn: parseDateOnly(input.receivedOn ?? tbilisiDateString()),
          notes: input.notes?.trim() || null,
          postingKey: input.postingKey,
        },
      });
      await audit(tx, actor, "greenhouse.batch", "growth_batch", batch.id);
      return batch;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().growthBatch.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

export async function advanceBatchStage(actor: Actor, batchId: string, stage: (typeof STAGES)[number]) {
  requirePermission(actor, "stock.write");
  if (!STAGES.includes(stage)) throw new BusinessError("ზრდის ეტაპი უცნობია", "validation");
  return withTx(async (tx) => {
    const batch = await tx.growthBatch.findFirst({
      where: { id: batchId, organizationId: actor.organizationId },
    });
    if (!batch) throw new BusinessError("პარტია ვერ მოიძებნა", "not_found");
    return tx.growthBatch.update({
      where: { id: batch.id },
      data: { stage, status: stage === "closed" ? "closed" : "open" },
    });
  });
}

export async function repotBatch(
  actor: Actor,
  input: {
    fromVariantId: string;
    toVariantId: string;
    potVariantId: string;
    locationId: string;
    plantQty: string;
    potQty: string;
    postingKey: string;
  },
) {
  requirePermission(actor, "stock.write");
  const plantQty = D(input.plantQty);
  const potQty = D(input.potQty);
  if (plantQty.lte(0) || potQty.lte(0)) throw new BusinessError("რაოდენობა ნულზე მეტი უნდა იყოს", "validation");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.stockMovement.findUnique({ where: { postingKey: `${input.postingKey}:out` } });
      if (existing) return { postingKey: input.postingKey };
      const from = await tx.productVariant.findFirst({
        where: { id: input.fromVariantId, organizationId: actor.organizationId },
      });
      const to = await tx.productVariant.findFirst({
        where: { id: input.toVariantId, organizationId: actor.organizationId },
      });
      const pot = await tx.productVariant.findFirst({
        where: { id: input.potVariantId, organizationId: actor.organizationId },
      });
      if (!from || !to || !pot) throw new BusinessError("ვარიანტი ვერ მოიძებნა", "not_found");
      const plantCost = plantQty.mul(D(from.averageCost));
      const potCost = potQty.mul(D(pot.averageCost));
      const unitCost = plantCost.plus(potCost).div(plantQty);
      await issueFromStock(tx, actor, {
        variantId: from.id,
        locationId: input.locationId,
        quantity: plantQty,
        postingKey: `${input.postingKey}:out`,
        movementType: "repot_out",
        sourceType: "repot",
        sourceId: input.postingKey,
      });
      await issueFromStock(tx, actor, {
        variantId: pot.id,
        locationId: input.locationId,
        quantity: potQty,
        postingKey: `${input.postingKey}:pot`,
        movementType: "repot_material",
        sourceType: "repot",
        sourceId: input.postingKey,
      });
      await receiveIntoStock(tx, actor, {
        variantId: to.id,
        locationId: input.locationId,
        quantity: plantQty,
        unitCost,
        postingKey: `${input.postingKey}:in`,
        movementType: "repot_in",
        sourceType: "repot",
        sourceId: input.postingKey,
      });
      return { postingKey: input.postingKey, unitCost: unitCost.toFixed(4) };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { postingKey: input.postingKey };
  }
}

export async function createInventoryCount(
  actor: Actor,
  input: { locationId: string; countedOn?: string; postingKey: string },
) {
  requirePermission(actor, "stock.write");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.inventoryCount.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
      const location = await tx.location.findFirst({
        where: { id: input.locationId, organizationId: actor.organizationId },
      });
      if (!location) throw new BusinessError("ლოკაცია ვერ მოიძებნა", "not_found");
      const balances = await tx.stockBalance.findMany({
        where: { organizationId: actor.organizationId, locationId: location.id },
      });
      const number = await nextNumber(tx, actor.organizationId, "inventory_count", "IC");
      return tx.inventoryCount.create({
        data: {
          organizationId: actor.organizationId,
          locationId: location.id,
          number,
          postingKey: input.postingKey,
          countedOn: parseDateOnly(input.countedOn ?? tbilisiDateString()),
          lines: {
            create: balances.map((row) => ({
              variantId: row.variantId,
              systemQty: D(row.onHand).toFixed(3),
              countedQty: D(row.onHand).toFixed(3),
              difference: "0.000",
            })),
          },
        },
        include: { lines: true, location: true },
      });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().inventoryCount.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

export async function setCountQuantities(
  actor: Actor,
  countId: string,
  lines: { lineId: string; countedQty: string }[],
) {
  requirePermission(actor, "stock.write");
  return withTx(async (tx) => {
    const count = await tx.inventoryCount.findFirst({
      where: { id: countId, organizationId: actor.organizationId },
      include: { lines: true },
    });
    if (!count) throw new BusinessError("ინვენტარიზაცია ვერ მოიძებნა", "not_found");
    if (count.status !== "draft") throw new BusinessError("დამტკიცებული სესია აღარ იცვლება", "invalid_state");
    for (const item of lines) {
      const line = count.lines.find((row) => row.id === item.lineId);
      if (!line) throw new BusinessError("ხაზი ვერ მოიძებნა", "not_found");
      const counted = D(item.countedQty);
      if (counted.lt(0)) throw new BusinessError("ფაქტი უარყოფითი ვერ იქნება", "validation");
      await tx.inventoryCountLine.update({
        where: { id: line.id },
        data: {
          countedQty: counted.toFixed(3),
          difference: counted.minus(line.systemQty).toFixed(3),
        },
      });
    }
    return tx.inventoryCount.findUniqueOrThrow({ where: { id: count.id }, include: { lines: true } });
  });
}

export async function postInventoryCount(actor: Actor, countId: string) {
  requirePermission(actor, "stock.write");
  return withTx(async (tx) => {
    const count = await tx.inventoryCount.findFirst({
      where: { id: countId, organizationId: actor.organizationId },
      include: { lines: true },
    });
    if (!count) throw new BusinessError("ინვენტარიზაცია ვერ მოიძებნა", "not_found");
    if (count.status === "posted") return count;
    for (const line of count.lines) {
      const difference = D(line.difference);
      if (difference.eq(0)) continue;
      const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: line.variantId } });
      if (difference.gt(0)) {
        await receiveIntoStock(tx, actor, {
          variantId: line.variantId,
          locationId: count.locationId,
          quantity: difference,
          unitCost: D(variant.averageCost),
          postingKey: `${count.postingKey}:${line.id}`,
          movementType: "count_adjust",
          sourceType: "inventory_count",
          sourceId: count.id,
        });
      } else {
        await issueFromStock(tx, actor, {
          variantId: line.variantId,
          locationId: count.locationId,
          quantity: difference.abs(),
          postingKey: `${count.postingKey}:${line.id}`,
          movementType: "count_adjust",
          sourceType: "inventory_count",
          sourceId: count.id,
        });
      }
    }
    await audit(tx, actor, "stock.count", "inventory_count", count.id);
    return tx.inventoryCount.update({ where: { id: count.id }, data: { status: "posted" } });
  });
}

export async function loadCount(tx: Tx, organizationId: string, countId: string) {
  const count = await tx.inventoryCount.findFirst({
    where: { id: countId, organizationId },
    include: { lines: true, location: true },
  });
  if (!count) throw new BusinessError("ინვენტარიზაცია ვერ მოიძებნა", "not_found");
  return count;
}
