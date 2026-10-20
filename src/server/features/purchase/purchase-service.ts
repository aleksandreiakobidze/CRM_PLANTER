import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { audit } from "@/server/audit";
import { getDb, type Tx } from "@/server/db";
import { BusinessError, isUniqueViolation } from "@/server/errors";
import { applyAverageCostAdjustment, issueFromStock, receiveIntoStock } from "@/server/features/inventory/stock-service";
import { D, Decimal, lineAmount, roundMoney } from "@/server/money";
import { nextNumber } from "@/server/numbers";
import { parseDateOnly, tbilisiDateString } from "@/server/time";
import { withTx } from "@/server/tx";

export async function createSupplier(
  actor: Actor,
  input: { name: string; country?: string; currency?: string; contact?: string; leadDays?: string; notes?: string },
) {
  requirePermission(actor, "purchase.write");
  const name = input.name.trim();
  if (!name) throw new BusinessError("მიმწოდებლის სახელი სავალდებულოა", "validation");
  return getDb().supplier.create({
    data: {
      organizationId: actor.organizationId,
      name,
      country: (input.country ?? "GE").trim() || "GE",
      currency: (input.currency ?? "GEL").trim() || "GEL",
      contact: input.contact?.trim() || null,
      leadDays: Number(input.leadDays ?? "0") || 0,
      notes: input.notes?.trim() || null,
    },
  });
}

export async function createPurchaseOrder(
  actor: Actor,
  input: {
    supplierId: string;
    expectedOn?: string;
    notes?: string;
    postingKey: string;
    lines: { variantId: string; quantity: string; unitPrice: string }[];
  },
) {
  requirePermission(actor, "purchase.write");
  if (input.lines.length === 0) throw new BusinessError("შესყიდვას სჭირდება ერთი ხაზი მაინც", "validation");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.purchaseOrder.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
      const supplier = await tx.supplier.findFirst({
        where: { id: input.supplierId, organizationId: actor.organizationId },
      });
      if (!supplier) throw new BusinessError("მიმწოდებელი ვერ მოიძებნა", "not_found");
      const number = await nextNumber(tx, actor.organizationId, "purchase_order", "PO");
      const created = await tx.purchaseOrder.create({
        data: {
          organizationId: actor.organizationId,
          supplierId: supplier.id,
          number,
          status: "draft",
          currency: supplier.currency,
          expectedOn: input.expectedOn ? parseDateOnly(input.expectedOn) : null,
          notes: input.notes?.trim() || null,
          postingKey: input.postingKey,
          lines: {
            create: await Promise.all(
              input.lines.map(async (line, index) => {
                const variant = await tx.productVariant.findFirst({
                  where: { id: line.variantId, organizationId: actor.organizationId },
                });
                if (!variant) throw new BusinessError("ვარიანტი ვერ მოიძებნა", "not_found");
                const quantity = D(line.quantity);
                const unitPrice = D(line.unitPrice);
                if (quantity.lte(0) || unitPrice.lt(0)) throw new BusinessError("რაოდენობა და ფასი არასწორია", "validation");
                return {
                  variantId: variant.id,
                  description: variant.nameKa,
                  quantity: quantity.toFixed(3),
                  unitPrice: unitPrice.toFixed(4),
                  lineTotal: lineAmount(quantity, unitPrice).toFixed(2),
                  sort: index,
                };
              }),
            ),
          },
        },
        include: { lines: true, supplier: true },
      });
      await audit(tx, actor, "purchase.create", "purchase_order", created.id);
      return created;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().purchaseOrder.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

export async function submitPurchaseOrder(actor: Actor, purchaseOrderId: string) {
  requirePermission(actor, "purchase.write");
  return withTx(async (tx) => {
    const order = await loadOrder(tx, actor.organizationId, purchaseOrderId);
    if (order.status !== "draft") throw new BusinessError("გაგზავნა მხოლოდ დრაფტზეა", "invalid_state");
    return tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "ordered" } });
  });
}

export async function receivePurchase(
  actor: Actor,
  input: {
    purchaseOrderId: string;
    locationId: string;
    receivedOn?: string;
    postingKey: string;
    lines: { purchaseLineId: string; quantity: string }[];
  },
) {
  requirePermission(actor, "purchase.write");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.goodsReceipt.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
      const order = await loadOrder(tx, actor.organizationId, input.purchaseOrderId);
      if (order.status === "draft") throw new BusinessError("ჯერ გაგზავნეთ შეკვეთა", "invalid_state");
      if (order.status === "received") throw new BusinessError("შეკვეთა უკვე სრულად მიღებულია", "invalid_state");
      const location = await tx.location.findFirst({
        where: { id: input.locationId, organizationId: actor.organizationId },
      });
      if (!location) throw new BusinessError("ლოკაცია ვერ მოიძებნა", "not_found");
      if (location.kind !== "greenhouse" && location.kind !== "warehouse") {
        throw new BusinessError("მიღება მხოლოდ სათბურში ან საწყობშია", "validation");
      }
      const number = await nextNumber(tx, actor.organizationId, "goods_receipt", "GR");
      const receipt = await tx.goodsReceipt.create({
        data: {
          organizationId: actor.organizationId,
          purchaseOrderId: order.id,
          locationId: location.id,
          number,
          postingKey: input.postingKey,
          receivedOn: parseDateOnly(input.receivedOn ?? tbilisiDateString()),
        },
      });
      for (const requested of input.lines) {
        const line = order.lines.find((item) => item.id === requested.purchaseLineId);
        if (!line) throw new BusinessError("შესყიდვის ხაზი ვერ მოიძებნა", "not_found");
        const quantity = D(requested.quantity);
        const remaining = D(line.quantity).minus(line.receivedQty);
        if (quantity.lte(0) || quantity.gt(remaining)) {
          throw new BusinessError("მიღება დარჩენილ რაოდენობას აღემატება", "invalid_quantity");
        }
        await receiveIntoStock(tx, actor, {
          variantId: line.variantId,
          locationId: location.id,
          quantity,
          unitCost: D(line.unitPrice),
          postingKey: `${input.postingKey}:${line.id}`,
          movementType: "stock_in",
          sourceType: "goods_receipt",
          sourceId: receipt.id,
          reason: order.number,
        });
        await tx.goodsReceiptLine.create({
          data: {
            receiptId: receipt.id,
            purchaseLineId: line.id,
            quantity: quantity.toFixed(3),
            unitCost: D(line.unitPrice).toFixed(4),
          },
        });
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { receivedQty: D(line.receivedQty).plus(quantity).toFixed(3) },
        });
      }
      const refreshed = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: order.id } });
      const allReceived = refreshed.every((line) => D(line.receivedQty).gte(D(line.quantity)));
      const anyReceived = refreshed.some((line) => D(line.receivedQty).gt(0));
      await tx.purchaseOrder.update({
        where: { id: order.id },
        data: { status: allReceived ? "received" : anyReceived ? "partial" : order.status },
      });
      await audit(tx, actor, "purchase.receive", "goods_receipt", receipt.id);
      return receipt;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().goodsReceipt.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

export async function returnToSupplier(
  actor: Actor,
  input: { receiptId: string; postingKey: string; lines: { receiptLineId: string; quantity: string }[] },
) {
  requirePermission(actor, "purchase.write");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.stockMovement.findUnique({ where: { postingKey: `${input.postingKey}:marker` } });
      if (existing) return existing;
      const receipt = await tx.goodsReceipt.findFirst({
        where: { id: input.receiptId, organizationId: actor.organizationId },
        include: { lines: true, purchaseOrder: true },
      });
      if (!receipt) throw new BusinessError("მიღება ვერ მოიძებნა", "not_found");
      for (const requested of input.lines) {
        const line = receipt.lines.find((item) => item.id === requested.receiptLineId);
        if (!line) throw new BusinessError("მიღების ხაზი ვერ მოიძებნა", "not_found");
        const quantity = D(requested.quantity);
        const remaining = D(line.quantity).minus(line.returnedQty);
        if (quantity.lte(0) || quantity.gt(remaining)) {
          throw new BusinessError("დაბრუნება მიღებულ რაოდენობას აღემატება", "invalid_quantity");
        }
        const purchaseLine = await tx.purchaseOrderLine.findUniqueOrThrow({ where: { id: line.purchaseLineId } });
        await issueFromStock(tx, actor, {
          variantId: purchaseLine.variantId,
          locationId: receipt.locationId,
          quantity,
          postingKey: `${input.postingKey}:${line.id}`,
          movementType: "purchase_return",
          sourceType: "goods_receipt",
          sourceId: receipt.id,
          reason: "მომწოდებლის დაბრუნება",
        });
        await tx.goodsReceiptLine.update({
          where: { id: line.id },
          data: { returnedQty: D(line.returnedQty).plus(quantity).toFixed(3) },
        });
        await tx.purchaseOrderLine.update({
          where: { id: purchaseLine.id },
          data: { receivedQty: D(purchaseLine.receivedQty).minus(quantity).toFixed(3) },
        });
      }
      await tx.stockMovement.create({
        data: {
          organizationId: actor.organizationId,
          variantId: (await tx.purchaseOrderLine.findUniqueOrThrow({ where: { id: receipt.lines[0].purchaseLineId } })).variantId,
          locationId: receipt.locationId,
          quantity: "0",
          unitCost: "0",
          movementType: "purchase_return_marker",
          postingKey: `${input.postingKey}:marker`,
          sourceType: "goods_receipt",
          sourceId: receipt.id,
          actorId: actor.userId,
        },
      });
      const refreshed = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: receipt.purchaseOrderId } });
      const allReceived = refreshed.every((line) => D(line.receivedQty).gte(D(line.quantity)));
      const anyReceived = refreshed.some((line) => D(line.receivedQty).gt(0));
      await tx.purchaseOrder.update({
        where: { id: receipt.purchaseOrderId },
        data: { status: allReceived ? "received" : anyReceived ? "partial" : "ordered" },
      });
      return { postingKey: input.postingKey };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return { postingKey: input.postingKey };
  }
}

export async function addLandedCost(
  actor: Actor,
  input: {
    purchaseOrderId: string;
    kind: "estimated" | "actual" | "late";
    amount: string;
    currency?: string;
    fxRate?: string;
    note?: string;
    postingKey: string;
  },
) {
  requirePermission(actor, "purchase.write");
  const amount = roundMoney(D(input.amount));
  if (amount.lte(0)) throw new BusinessError("ხარჯი ნულზე მეტი უნდა იყოს", "validation");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.landedCost.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
      const order = await loadOrder(tx, actor.organizationId, input.purchaseOrderId);
      const valueTotal = order.lines.reduce((sum, line) => sum.plus(D(line.lineTotal)), new Decimal(0));
      if (valueTotal.lte(0)) throw new BusinessError("განაწილება ღირებულების გარეშე ვერ ხდება", "invalid_state");
      const fx = D(input.fxRate ?? "1");
      const gel = roundMoney(amount.mul(fx));
      const landed = await tx.landedCost.create({
        data: {
          organizationId: actor.organizationId,
          purchaseOrderId: order.id,
          kind: input.kind,
          amount: amount.toFixed(2),
          currency: input.currency ?? order.currency,
          fxRate: fx.toFixed(6),
          note: input.note?.trim() || null,
          postingKey: input.postingKey,
        },
      });
      let allocated = new Decimal(0);
      for (const [index, line] of order.lines.entries()) {
        const share =
          index === order.lines.length - 1
            ? roundMoney(gel.minus(allocated))
            : roundMoney(gel.mul(D(line.lineTotal)).div(valueTotal));
        allocated = allocated.plus(share);
        await tx.landedCostAllocation.create({
          data: {
            landedCostId: landed.id,
            variantId: line.variantId,
            amount: share.toFixed(2),
            postingKey: `${input.postingKey}:${line.id}`,
          },
        });
        if (input.kind !== "estimated") {
          await applyAverageCostAdjustment(tx, actor.organizationId, line.variantId, share);
        }
      }
      if (input.kind !== "estimated") {
        await tx.expense.create({
          data: {
            organizationId: actor.organizationId,
            category: input.kind === "late" ? "landed_late" : "landed_actual",
            amount: gel.toFixed(2),
            sourceType: "landed_cost",
            sourceId: landed.id,
            postingKey: `${input.postingKey}:expense`,
          },
        });
      }
      await audit(tx, actor, "purchase.landed", "landed_cost", landed.id, undefined, { amount: gel.toFixed(2) });
      return landed;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().landedCost.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

async function loadOrder(tx: Tx, organizationId: string, purchaseOrderId: string) {
  const order = await tx.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, organizationId },
    include: { lines: { orderBy: { sort: "asc" } }, supplier: true },
  });
  if (!order) throw new BusinessError("შესყიდვა ვერ მოიძებნა", "not_found");
  return order;
}
