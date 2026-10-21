import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { audit } from "@/server/audit";
import { getDb, type Tx } from "@/server/db";
import { BusinessError, isUniqueViolation } from "@/server/errors";
import { consumeReservation, releaseReservation, reserveQuantity } from "@/server/features/inventory/stock-service";
import { D, Decimal, lineAmount } from "@/server/money";
import { nextNumber } from "@/server/numbers";
import { isLineKind, isStockLine, LINE_KIND_LABEL, type LineKind } from "@/server/features/sales/line-kinds";
import { parseDateOnly, tbilisiDateString } from "@/server/time";
import { withTx } from "@/server/tx";

function orderDate(value?: string) {
  const iso = value?.trim() || tbilisiDateString();
  try {
    return parseDateOnly(iso);
  } catch {
    throw new BusinessError("თარიღის ფორმატი უნდა იყოს YYYY-MM-DD", "validation");
  }
}

export type DraftLine = {
  kind?: LineKind;
  variantId?: string;
  quantity: string;
  unitPrice?: string;
  discountAmount?: string;
  description?: string;
};

const OPEN = new Set(["open", "draft"]);
const AUTHORIZED = new Set(["authorized", "confirmed"]);
export const STOCK_ISSUED = new Set(["completed", "rs_error", "fulfilled"]);

export function parseDocumentLines(raw: string): DraftLine[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BusinessError("ხაზები ვერ წაიკითხა", "validation");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new BusinessError("ერთი ხაზი მაინც სჭირდება", "validation");
  return parsed.map((row) => {
    const item = row as {
      kind?: string;
      itemId?: string;
      variantId?: string;
      quantity?: string;
      unitPrice?: string;
      discountAmount?: string;
      description?: string;
    };
    const unitPrice = String(item.unitPrice ?? "").trim();
    const kind = isLineKind(String(item.kind ?? "item")) ? (item.kind as LineKind) : "item";
    return {
      kind,
      variantId: String(item.itemId || item.variantId || ""),
      quantity: String(item.quantity || "1"),
      unitPrice: unitPrice || undefined,
      discountAmount: String(item.discountAmount || "0"),
      description: String(item.description ?? "").trim() || undefined,
    };
  });
}

async function prepareLines(tx: Tx, organizationId: string, lines: DraftLine[]) {
  const prepared = [];
  for (const line of lines) {
    const quantity = D(line.quantity);
    if (quantity.lte(0)) throw new BusinessError("რაოდენობა ნულზე მეტი უნდა იყოს", "validation");
    const kind = line.kind && isLineKind(line.kind) ? line.kind : "item";
    const discount = D(line.discountAmount ?? "0");
    if (!isStockLine(kind)) {
      if (!line.unitPrice) throw new BusinessError("სერვისის ხაზს ფასი სჭირდება", "validation");
      const unitPrice = D(line.unitPrice);
      const description = line.description?.trim() || LINE_KIND_LABEL[kind];
      prepared.push({
        kind,
        variantId: null,
        description,
        quantity: quantity.toFixed(3),
        unitPrice: unitPrice.toFixed(4),
        discountAmount: discount.toFixed(2),
        lineTotal: lineAmount(quantity, unitPrice, discount).toFixed(2),
      });
      continue;
    }
    const variant = await tx.productVariant.findFirst({ where: { id: line.variantId, organizationId } });
    if (!variant) throw new BusinessError("ვარიანტი ვერ მოიძებნა", "not_found");
    const unitPrice = line.unitPrice ? D(line.unitPrice) : await resolveUnitPrice(tx, organizationId, variant.id, quantity);
    prepared.push({
      kind,
      variantId: variant.id,
      description: line.description || variant.nameKa,
      quantity: quantity.toFixed(3),
      unitPrice: unitPrice.toFixed(4),
      discountAmount: discount.toFixed(2),
      lineTotal: lineAmount(quantity, unitPrice, discount).toFixed(2),
    });
  }
  return prepared;
}

async function salesLocation(tx: Tx, organizationId: string) {
  return tx.location.findUniqueOrThrow({
    where: { organizationId_code: { organizationId, code: "sales" } },
  });
}

async function resolveUnitPrice(tx: Tx, organizationId: string, variantId: string, quantity: Decimal): Promise<Decimal> {
  const list = await tx.priceList.findUnique({
    where: { organizationId_code: { organizationId, code: "retail" } },
  });
  if (list) {
    const entries = await tx.priceListEntry.findMany({
      where: { priceListId: list.id, variantId },
      orderBy: { minQty: "desc" },
    });
    const match = entries.find((entry) => D(entry.minQty).lte(quantity));
    if (match) return D(match.unitPrice);
  }
  const variant = await tx.productVariant.findFirstOrThrow({ where: { id: variantId, organizationId } });
  return D(variant.listPrice);
}

export async function createQuote(actor: Actor, input: { customerId: string; notes?: string; lines: DraftLine[] }) {
  requirePermission(actor, "sales.write");
  if (input.lines.length === 0) throw new BusinessError("შეთავაზებას ერთი ხაზი მაინც სჭირდება", "validation");
  return withTx(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, organizationId: actor.organizationId, mergedIntoId: null } });
    if (!customer) throw new BusinessError("კლიენტი ვერ მოიძებნა", "not_found");
    const number = await nextNumber(tx, actor.organizationId, "quote", "QT");
    const prepared = await prepareLines(tx, actor.organizationId, input.lines);
    const quote = await tx.quote.create({
      data: {
        organizationId: actor.organizationId,
        number,
        customerId: customer.id,
        notes: input.notes,
        createdById: actor.userId,
        lines: { create: prepared },
      },
      include: { lines: true },
    });
    await audit(tx, actor, "quote.create", "quote", quote.id, undefined, { number: quote.number });
    return quote;
  });
}

export async function convertQuoteToOrder(actor: Actor, quoteId: string) {
  requirePermission(actor, "sales.write");
  try {
    return await withTx((tx) => convertQuoteTx(tx, actor, quoteId));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().salesOrder.findUnique({ where: { quoteId } });
    if (!existing || existing.organizationId !== actor.organizationId) throw error;
    return existing;
  }
}

async function convertQuoteTx(tx: Tx, actor: Actor, quoteId: string) {
  const existing = await tx.salesOrder.findUnique({ where: { quoteId } });
  if (existing) return existing;
  const quote = await tx.quote.findFirst({
    where: { id: quoteId, organizationId: actor.organizationId },
    include: { lines: true },
  });
  if (!quote) throw new BusinessError("შეთავაზება ვერ მოიძებნა", "not_found");
  if (quote.lines.some((line) => isStockLine(line.kind) && !line.variantId)) {
    throw new BusinessError("შეთავაზების აითემს ვარიანტი აკლია", "validation");
  }
  const location = await salesLocation(tx, actor.organizationId);
  const number = await nextNumber(tx, actor.organizationId, "sales_order", "SO");
  const order = await tx.salesOrder.create({
    data: {
      organizationId: actor.organizationId,
      number,
      customerId: quote.customerId,
      quoteId: quote.id,
      postingKey: `order-from-quote:${quote.id}`,
      orderedOn: orderDate(),
      lines: {
        create: quote.lines.map((line) => ({
          kind: line.kind,
          variantId: line.variantId,
          locationId: location.id,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          lineTotal: line.lineTotal,
        })),
      },
    },
  });
  await tx.quote.update({ where: { id: quote.id }, data: { status: "converted" } });
  await audit(tx, actor, "quote.convert", "sales_order", order.id, undefined, { quoteId });
  return order;
}

export async function createSalesOrder(actor: Actor, input: { customerId: string; notes?: string; orderedOn?: string; postingKey: string; lines: DraftLine[] }) {
  requirePermission(actor, "sales.write");
  if (input.lines.length === 0) throw new BusinessError("შეკვეთას ერთი ხაზი მაინც სჭირდება", "validation");
  try {
    return await withTx((tx) => createSalesOrderTx(tx, actor, input));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().salesOrder.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing || existing.organizationId !== actor.organizationId) throw error;
    return existing;
  }
}

async function createSalesOrderTx(tx: Tx, actor: Actor, input: { customerId: string; notes?: string; orderedOn?: string; postingKey: string; lines: DraftLine[] }) {
  const existing = await tx.salesOrder.findUnique({ where: { postingKey: input.postingKey } });
  if (existing) return existing;
  const customer = await tx.customer.findFirst({ where: { id: input.customerId, organizationId: actor.organizationId, mergedIntoId: null } });
  if (!customer) throw new BusinessError("კლიენტი ვერ მოიძებნა", "not_found");
  const location = await salesLocation(tx, actor.organizationId);
  const prepared = await prepareLines(tx, actor.organizationId, input.lines);
  const number = await nextNumber(tx, actor.organizationId, "sales_order", "SO");
  const order = await tx.salesOrder.create({
    data: {
      organizationId: actor.organizationId,
      number,
      customerId: customer.id,
      status: "open",
      notes: input.notes,
      orderedOn: orderDate(input.orderedOn),
      postingKey: input.postingKey,
      lines: {
        create: prepared.map((line) => ({ ...line, locationId: location.id })),
      },
    },
    include: { lines: true },
  });
  await audit(tx, actor, "order.create", "sales_order", order.id, undefined, { number: order.number });
  return order;
}

export async function updateOpenOrder(actor: Actor, orderId: string, input: { customerId: string; notes?: string; orderedOn?: string; lines: DraftLine[] }) {
  requirePermission(actor, "sales.write");
  if (input.lines.length === 0) throw new BusinessError("შეკვეთას ერთი ხაზი მაინც სჭირდება", "validation");
  return withTx(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: orderId, organizationId: actor.organizationId },
      include: { fulfillments: true },
    });
    if (!order) throw new BusinessError("შეკვეთა ვერ მოიძებნა", "not_found");
    if (!OPEN.has(order.status) || order.fulfillments.length > 0) throw new BusinessError("ხაზები იცვლება მხოლოდ ღია შეკვეთაზე", "invalid_state");
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, organizationId: actor.organizationId, mergedIntoId: null } });
    if (!customer) throw new BusinessError("კლიენტი ვერ მოიძებნა", "not_found");
    const location = await salesLocation(tx, actor.organizationId);
    const prepared = await prepareLines(tx, actor.organizationId, input.lines);
    await tx.salesOrderLine.deleteMany({ where: { orderId: order.id } });
    await tx.salesOrder.update({
      where: { id: order.id },
      data: {
        customerId: customer.id,
        notes: input.notes,
        orderedOn: orderDate(input.orderedOn),
        version: { increment: 1 },
        lines: { create: prepared.map((line) => ({ ...line, locationId: location.id })) },
      },
    });
    return tx.salesOrder.findUniqueOrThrow({ where: { id: order.id }, include: { lines: true } });
  });
}

export async function confirmOrder(actor: Actor, orderId: string) {
  requirePermission(actor, "sales.write");
  try {
    return await withTx((tx) => confirmOrderTx(tx, actor, orderId));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().salesOrder.findFirst({ where: { id: orderId, organizationId: actor.organizationId } });
    if (!existing) throw error;
    return existing;
  }
}

async function confirmOrderTx(tx: Tx, actor: Actor, orderId: string) {
  const order = await tx.salesOrder.findFirst({
    where: { id: orderId, organizationId: actor.organizationId },
    include: { lines: true },
  });
  if (!order) throw new BusinessError("შეკვეთა ვერ მოიძებნა", "not_found");
  if (AUTHORIZED.has(order.status) || STOCK_ISSUED.has(order.status)) return order;
  if (!OPEN.has(order.status)) throw new BusinessError("გაუქმებული შეკვეთა ვერ ჯავშნდება", "invalid_state");
  const lines = [...order.lines]
    .filter((line) => isStockLine(line.kind) && line.variantId)
    .sort((a, b) => a.variantId!.localeCompare(b.variantId!) || a.locationId.localeCompare(b.locationId));
  for (const line of lines) {
    await reserveQuantity(tx, {
      organizationId: actor.organizationId,
      variantId: line.variantId!,
      locationId: line.locationId,
      quantity: D(line.quantity),
      status: "confirmed",
      sourceType: "sales_order",
      sourceId: order.id,
      postingKey: `reserve:${order.id}:${line.id}`,
    });
  }
  return tx.salesOrder.update({ where: { id: order.id }, data: { status: "authorized", version: { increment: 1 } } });
}

export async function cancelOrder(actor: Actor, orderId: string) {
  requirePermission(actor, "sales.write");
  return withTx(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: orderId, organizationId: actor.organizationId },
      include: { lines: true, fulfillments: true },
    });
    if (!order) throw new BusinessError("შეკვეთა ვერ მოიძებნა", "not_found");
    if (order.status === "cancelled") return order;
    if (order.fulfillments.length > 0 || order.lines.some((line) => D(line.fulfilledQty).gt(0))) {
      throw new BusinessError("მიწოდებული საქონელი გაუქმებით არ ბრუნდება", "invalid_state");
    }
    const reservations = await tx.reservation.findMany({ where: { sourceType: "sales_order", sourceId: order.id } });
    for (const reservation of reservations) {
      await releaseReservation(tx, reservation.id, "released");
    }
    return tx.salesOrder.update({ where: { id: order.id }, data: { status: "cancelled", version: { increment: 1 } } });
  });
}

export async function fulfillOrder(actor: Actor, orderId: string) {
  requirePermission(actor, "stock.write");
  const postingKey = `fulfill:${orderId}`;
  try {
    return await withTx((tx) => fulfillOrderTx(tx, actor, orderId, postingKey));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().fulfillment.findUnique({ where: { postingKey } });
    if (!existing || existing.organizationId !== actor.organizationId) throw error;
    return existing;
  }
}

async function fulfillOrderTx(tx: Tx, actor: Actor, orderId: string, postingKey: string) {
  const existing = await tx.fulfillment.findUnique({ where: { postingKey } });
  if (existing) return existing;
  const order = await tx.salesOrder.findFirst({
    where: { id: orderId, organizationId: actor.organizationId },
    include: { lines: true },
  });
  if (!order) throw new BusinessError("შეკვეთა ვერ მოიძებნა", "not_found");
  if (!AUTHORIZED.has(order.status)) throw new BusinessError("მიწოდებამდე შეკვეთა ავტორიზებული უნდა იყოს", "invalid_state");
  const number = await nextNumber(tx, actor.organizationId, "fulfillment", "FF");
  const fulfillment = await tx.fulfillment.create({
    data: {
      organizationId: actor.organizationId,
      orderId: order.id,
      number,
      postingKey,
      actorId: actor.userId,
      fulfilledAt: new Date(),
    },
  });
  for (const line of order.lines) {
    const remaining = D(line.quantity).minus(line.fulfilledQty);
    if (remaining.lte(0)) continue;
    if (!isStockLine(line.kind) || !line.variantId) {
      await tx.salesOrderLine.update({
        where: { id: line.id },
        data: { fulfilledQty: D(line.fulfilledQty).plus(remaining).toFixed(3) },
      });
      continue;
    }
    const reservation = await tx.reservation.findUnique({ where: { postingKey: `reserve:${order.id}:${line.id}` } });
    if (!reservation) throw new BusinessError("რეზერვი ვერ მოიძებნა", "not_found");
    const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: line.variantId } });
    await consumeReservation(tx, reservation.id, {
      unitCost: D(variant.averageCost),
      movementType: "sale_issue",
      postingKey: `issue:${order.id}:${line.id}`,
      sourceType: "fulfillment",
      sourceId: fulfillment.id,
      actorId: actor.userId,
      quantity: remaining,
    });
    await tx.fulfillmentLine.create({
      data: {
        fulfillmentId: fulfillment.id,
        orderLineId: line.id,
        variantId: line.variantId,
        locationId: line.locationId,
        quantity: remaining.toFixed(3),
        unitCost: D(variant.averageCost).toFixed(4),
      },
    });
    await tx.salesOrderLine.update({
      where: { id: line.id },
      data: { fulfilledQty: D(line.fulfilledQty).plus(remaining).toFixed(3) },
    });
  }
  await tx.salesOrder.update({ where: { id: order.id }, data: { status: "rs_error", version: { increment: 1 } } });
  await audit(tx, actor, "order.fulfill", "fulfillment", fulfillment.id);
  return fulfillment;
}

export async function returnSoldGoods(
  actor: Actor,
  input: { orderId: string; postingKey: string; reason: string; lines: { orderLineId: string; quantity: string; condition: "healthy" | "damaged" }[] },
) {
  requirePermission(actor, "stock.write");
  try {
    return await withTx((tx) => returnSoldGoodsTx(tx, actor, input));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().salesReturn.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

async function returnSoldGoodsTx(
  tx: Tx,
  actor: Actor,
  input: { orderId: string; postingKey: string; reason: string; lines: { orderLineId: string; quantity: string; condition: "healthy" | "damaged" }[] },
) {
  const existing = await tx.salesReturn.findUnique({ where: { postingKey: input.postingKey } });
  if (existing) return existing;
  const order = await tx.salesOrder.findFirst({
    where: { id: input.orderId, organizationId: actor.organizationId },
    include: { lines: true },
  });
  if (!order) throw new BusinessError("შეკვეთა ვერ მოიძებნა", "not_found");
  const quarantine = await tx.location.findUniqueOrThrow({
    where: { organizationId_code: { organizationId: actor.organizationId, code: "quarantine" } },
  });
  const number = await nextNumber(tx, actor.organizationId, "sales_return", "SR");
  const salesReturn = await tx.salesReturn.create({
    data: {
      organizationId: actor.organizationId,
      orderId: order.id,
      number,
      postingKey: input.postingKey,
      reason: input.reason,
    },
  });
  for (const requested of input.lines) {
    const line = order.lines.find((item) => item.id === requested.orderLineId);
    if (!line) throw new BusinessError("შეკვეთის ხაზი ვერ მოიძებნა", "not_found");
    const quantity = D(requested.quantity);
    const returnable = D(line.fulfilledQty).minus(line.returnedQty);
    if (quantity.lte(0) || quantity.gt(returnable)) {
      throw new BusinessError("დაბრუნება აღემატება დარჩენილ გაყიდულ რაოდენობას", "invalid_quantity");
    }
    if (!isStockLine(line.kind) || !line.variantId) {
      throw new BusinessError("სერვისის ხაზი მარაგში არ ბრუნდება", "invalid_state");
    }
    const locationId = requested.condition === "damaged" ? quarantine.id : line.locationId;
    const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: line.variantId } });
    const { changeBalance } = await import("@/server/features/inventory/stock-service");
    await changeBalance(tx, {
      organizationId: actor.organizationId,
      variantId: line.variantId,
      locationId,
      onHandDelta: quantity,
      reservedDelta: new Decimal(0),
      movement: {
        quantity,
        unitCost: D(variant.averageCost),
        movementType: "return_in",
        postingKey: `${input.postingKey}:${line.id}`,
        sourceType: "sales_return",
        sourceId: salesReturn.id,
        reason: input.reason,
        actorId: actor.userId,
      },
    });
    await tx.salesReturnLine.create({
      data: {
        returnId: salesReturn.id,
        orderLineId: line.id,
        quantity: quantity.toFixed(3),
        condition: requested.condition,
        locationId,
      },
    });
    await tx.salesOrderLine.update({
      where: { id: line.id },
      data: { returnedQty: D(line.returnedQty).plus(quantity).toFixed(3) },
    });
  }
  return salesReturn;
}

export async function holdStock(
  actor: Actor,
  input: { variantId: string; locationId: string; quantity: string; postingKey: string; expiresAt: Date },
) {
  requirePermission(actor, "stock.write");
  return withTx((tx) =>
    reserveQuantity(tx, {
      organizationId: actor.organizationId,
      variantId: input.variantId,
      locationId: input.locationId,
      quantity: D(input.quantity),
      status: "held",
      sourceType: "hold",
      sourceId: input.postingKey,
      postingKey: input.postingKey,
      expiresAt: input.expiresAt,
    }),
  );
}
