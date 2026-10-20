import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { getDb, type Tx } from "@/server/db";
import { BusinessError, isUniqueViolation } from "@/server/errors";
import { createInvoiceFromOrder } from "@/server/features/finance/invoice-service";
import { openSecret, sealSecret } from "@/server/features/integrations/secret";
import { uploadWaybill, vatTypeFor, type WaybillDraft, type WaybillGood } from "@/server/features/integrations/rs-waybill";
import { transferQuantity } from "@/server/features/inventory/stock-service";
import { fulfillOrder } from "@/server/features/sales/order-service";
import { D, lineAmount } from "@/server/money";
import { nextNumber } from "@/server/numbers";
import { withTx } from "@/server/tx";

export type TransportInput = {
  waybillType: 1 | 2 | 3;
  driverTin: string;
  driverName: string;
  carNumber: string;
  transportText: string;
  startAddress: string;
  endAddress: string;
  beginOn: string;
};

export function readTransport(input: TransportInput): TransportInput {
  const waybillType = input.waybillType;
  if (waybillType !== 1 && waybillType !== 2 && waybillType !== 3) {
    throw new BusinessError("ტრანსპორტირების ტიპი აირჩიეთ", "validation");
  }
  const required: [string, string][] = [
    [input.driverTin, "მძღოლის პირადი ნომერი სავალდებულოა"],
    [input.driverName, "მძღოლის სახელი სავალდებულოა"],
    [input.carNumber, "მანქანის ნომერი სავალდებულოა"],
    [input.startAddress, "დაწყების მისამართი სავალდებულოა"],
    [input.endAddress, "დასრულების მისამართი სავალდებულოა"],
    [input.beginOn, "დაწყების თარიღი სავალდებულოა"],
  ];
  for (const [value, message] of required) {
    if (!value.trim()) throw new BusinessError(message, "validation");
  }
  return {
    waybillType,
    driverTin: input.driverTin.trim(),
    driverName: input.driverName.trim(),
    carNumber: input.carNumber.trim(),
    transportText: input.transportText.trim(),
    startAddress: input.startAddress.trim(),
    endAddress: input.endAddress.trim(),
    beginOn: input.beginOn.trim(),
  };
}

async function credentials(organizationId: string): Promise<{ su: string; sp: string } | null> {
  const connection = await getDb().integrationConnection.findUnique({
    where: { organizationId_provider: { organizationId, provider: "rs" } },
  });
  if (!connection?.secretCipher || connection.status !== "configured") return null;
  try {
    const parsed = JSON.parse(openSecret(connection.secretCipher)) as { su?: string; sp?: string };
    if (!parsed.su || !parsed.sp) return null;
    return { su: parsed.su, sp: parsed.sp };
  } catch {
    return null;
  }
}

export async function saveRsCredentials(actor: Actor, input: { su: string; sp: string; clear?: boolean }) {
  requirePermission(actor, "admin.users");
  const existing = await getDb().integrationConnection.findUnique({
    where: { organizationId_provider: { organizationId: actor.organizationId, provider: "rs" } },
  });
  if (input.clear || (!input.su.trim() && !input.sp.trim())) {
    await getDb().integrationConnection.upsert({
      where: { organizationId_provider: { organizationId: actor.organizationId, provider: "rs" } },
      update: { status: "not_configured", secretCipher: null, lastError: null },
      create: { organizationId: actor.organizationId, provider: "rs", status: "not_configured" },
    });
    return;
  }
  let current = { su: "", sp: "" };
  if (existing?.secretCipher) {
    try {
      current = JSON.parse(openSecret(existing.secretCipher)) as { su: string; sp: string };
    } catch {
      current = { su: "", sp: "" };
    }
  }
  const su = input.su.trim() || current.su;
  const sp = input.sp.trim() || current.sp;
  if (!su || !sp) throw new BusinessError("RS სერვისის მომხმარებელი და პაროლი ორივე სავალდებულოა", "validation");
  await getDb().integrationConnection.upsert({
    where: { organizationId_provider: { organizationId: actor.organizationId, provider: "rs" } },
    update: { status: "configured", secretCipher: sealSecret(JSON.stringify({ su, sp })), lastError: null },
    create: {
      organizationId: actor.organizationId,
      provider: "rs",
      status: "configured",
      secretCipher: sealSecret(JSON.stringify({ su, sp })),
    },
  });
}

function goodsOf(
  rows: { name: string; quantity: string; price: string; amount: string; barCode: string }[],
  vatType: number,
): WaybillGood[] {
  return rows.map((row) => ({ ...row, vatType }));
}

async function pushWaybill(
  organizationId: string,
  draft: Omit<WaybillDraft, "id" | "goods"> & { id: number; goods: Omit<WaybillGood, "vatType">[] },
): Promise<{ ok: true; id: string; number: string } | { ok: false; id?: string; message: string }> {
  const creds = await credentials(organizationId);
  if (!creds) return { ok: false, message: "RS არ არის კონფიგურირებული" };
  const organization = await getDb().organization.findUniqueOrThrow({ where: { id: organizationId } });
  const vatType = vatTypeFor(organization.taxMode);
  if (vatType === null) {
    return { ok: false, message: "ატვირთვამდე პარამეტრებში აირჩიეთ დღგ-ის რეჟიმი" };
  }
  return uploadWaybill(creds, { ...draft, goods: goodsOf(draft.goods, vatType) });
}

const transportData = (input: TransportInput) => ({
  waybillType: input.waybillType,
  driverTin: input.driverTin,
  driverName: input.driverName,
  carNumber: input.carNumber,
  transportText: input.transportText,
  startAddress: input.startAddress,
  endAddress: input.endAddress,
  beginOn: new Date(`${input.beginOn}T00:00:00.000Z`),
});

export async function completeSale(actor: Actor, input: TransportInput & { orderId: string; createInvoice: boolean }) {
  requirePermission(actor, "sales.write");
  requirePermission(actor, "stock.write");
  const transport = readTransport(input);
  const order = await getDb().salesOrder.findFirst({
    where: { id: input.orderId, organizationId: actor.organizationId },
    include: { customer: true },
  });
  if (!order) throw new BusinessError("შეკვეთა ვერ მოიძებნა", "not_found");
  if (!order.customer.identificationCode?.trim()) {
    throw new BusinessError("მყიდველის საიდენტიფიკაციო კოდი სავალდებულოა", "validation");
  }
  const fulfillment = await fulfillOrder(actor, order.id);
  await getDb().fulfillment.update({ where: { id: fulfillment.id }, data: transportData(transport) });
  const uploaded = await uploadSale(actor, order.id);
  if (uploaded.ok && input.createInvoice) await createInvoiceFromOrder(actor, order.id);
  return uploaded;
}

export async function uploadSale(actor: Actor, orderId: string) {
  requirePermission(actor, "sales.write");
  const fulfillment = await getDb().fulfillment.findFirst({
    where: { orderId, organizationId: actor.organizationId },
    include: { order: { include: { customer: true, lines: true } }, lines: true },
    orderBy: { fulfilledAt: "desc" },
  });
  if (!fulfillment) throw new BusinessError("ჯერ მარაგი უნდა ჩამოიწეროს", "invalid_state");
  if (fulfillment.rsWaybillNumber) {
    await getDb().salesOrder.update({ where: { id: fulfillment.orderId }, data: { status: "completed" } });
    return { ok: true as const, id: fulfillment.rsWaybillId ?? "", number: fulfillment.rsWaybillNumber };
  }
  const variants = await getDb().productVariant.findMany({
    where: { id: { in: fulfillment.order.lines.map((line) => line.variantId) } },
  });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const goods = fulfillment.order.lines.map((line) => {
    const variant = byId.get(line.variantId);
    return {
      name: line.description,
      quantity: D(line.quantity).toFixed(3),
      price: D(line.unitPrice).toFixed(4),
      amount: D(line.lineTotal).toFixed(2),
      barCode: variant?.barcode || variant?.sku || line.variantId,
    };
  });
  const fullAmount = fulfillment.order.lines.reduce((sum, line) => sum.plus(D(line.lineTotal)), D(0)).toFixed(2);
  const result = await pushWaybill(actor.organizationId, {
    id: Number(fulfillment.rsWaybillId || 0),
    type: fulfillment.waybillType === 3 ? 3 : 2,
    buyerTin: fulfillment.order.customer.identificationCode ?? "",
    buyerName: fulfillment.order.customer.legalName || fulfillment.order.customer.name,
    startAddress: fulfillment.startAddress,
    endAddress: fulfillment.endAddress,
    driverTin: fulfillment.driverTin,
    driverName: fulfillment.driverName,
    carNumber: fulfillment.carNumber,
    transportText: fulfillment.transportText,
    beginDate: fulfillment.beginOn ? fulfillment.beginOn.toISOString().slice(0, 10) : "",
    fullAmount,
    goods,
  });
  if (!result.ok) {
    await getDb().fulfillment.update({
      where: { id: fulfillment.id },
      data: { rsError: result.message, rsWaybillId: result.id ?? fulfillment.rsWaybillId },
    });
    await getDb().salesOrder.update({ where: { id: fulfillment.orderId }, data: { status: "rs_error" } });
    return result;
  }
  await getDb().fulfillment.update({
    where: { id: fulfillment.id },
    data: { rsWaybillId: result.id, rsWaybillNumber: result.number, rsError: null },
  });
  await getDb().salesOrder.update({ where: { id: fulfillment.orderId }, data: { status: "completed" } });
  return result;
}

export async function retrySaleUpload(actor: Actor, input: TransportInput & { orderId: string; createInvoice: boolean }) {
  requirePermission(actor, "sales.write");
  const transport = readTransport(input);
  const fulfillment = await getDb().fulfillment.findFirst({
    where: { orderId: input.orderId, organizationId: actor.organizationId },
  });
  if (!fulfillment) throw new BusinessError("მიწოდება ჯერ არ გატარებულა", "invalid_state");
  await getDb().fulfillment.update({ where: { id: fulfillment.id }, data: transportData(transport) });
  const uploaded = await uploadSale(actor, input.orderId);
  if (uploaded.ok && input.createInvoice) await createInvoiceFromOrder(actor, input.orderId);
  return uploaded;
}

type ShipmentLine = { variantId: string; quantity: string };

export async function completeInternalShipment(
  actor: Actor,
  input: TransportInput & { fromLocationId: string; toLocationId: string; postingKey: string; lines: ShipmentLine[] },
) {
  requirePermission(actor, "stock.write");
  const transport = readTransport({ ...input, waybillType: 1 });
  if (input.fromLocationId === input.toLocationId) throw new BusinessError("საიდან და სად განსხვავებული უნდა იყოს", "validation");
  if (input.lines.length === 0) throw new BusinessError("ერთი ხაზი მაინც სჭირდება", "validation");
  const shipment = await postInternal(actor, { ...input, ...transport });
  return uploadInternal(actor, shipment.id);
}

async function postInternal(
  actor: Actor,
  input: TransportInput & { fromLocationId: string; toLocationId: string; postingKey: string; lines: ShipmentLine[] },
) {
  try {
    return await withTx((tx) => postInternalTx(tx, actor, input));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().internalShipment.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing || existing.organizationId !== actor.organizationId) throw error;
    return existing;
  }
}

async function postInternalTx(
  tx: Tx,
  actor: Actor,
  input: TransportInput & { fromLocationId: string; toLocationId: string; postingKey: string; lines: ShipmentLine[] },
) {
  const existing = await tx.internalShipment.findUnique({ where: { postingKey: input.postingKey }, include: { lines: true } });
  if (existing) return existing;
  const from = await tx.location.findFirst({ where: { id: input.fromLocationId, organizationId: actor.organizationId } });
  const to = await tx.location.findFirst({ where: { id: input.toLocationId, organizationId: actor.organizationId } });
  if (!from || !to) throw new BusinessError("ლოკაცია ვერ მოიძებნა", "not_found");
  const number = await nextNumber(tx, actor.organizationId, "internal_shipment", "WB");
  const shipment = await tx.internalShipment.create({
    data: {
      organizationId: actor.organizationId,
      number,
      status: "rs_error",
      fromLocationId: from.id,
      toLocationId: to.id,
      postingKey: input.postingKey,
      driverTin: input.driverTin,
      driverName: input.driverName,
      carNumber: input.carNumber,
      transportText: input.transportText,
      startAddress: input.startAddress,
      endAddress: input.endAddress,
      beginOn: new Date(`${input.beginOn}T00:00:00.000Z`),
    },
  });
  for (const line of input.lines) {
    const quantity = D(line.quantity);
    if (quantity.lte(0)) throw new BusinessError("რაოდენობა ნულზე მეტი უნდა იყოს", "validation");
    const variant = await tx.productVariant.findFirst({ where: { id: line.variantId, organizationId: actor.organizationId } });
    if (!variant) throw new BusinessError("ვარიანტი ვერ მოიძებნა", "not_found");
    const created = await tx.internalShipmentLine.create({
      data: {
        shipmentId: shipment.id,
        variantId: variant.id,
        description: variant.nameKa,
        quantity: quantity.toFixed(3),
        unitPrice: D(variant.averageCost).toFixed(4),
      },
    });
    await transferQuantity(tx, {
      organizationId: actor.organizationId,
      variantId: variant.id,
      fromLocationId: from.id,
      toLocationId: to.id,
      quantity,
      unitCost: D(variant.averageCost),
      postingKey: `transfer:${shipment.id}:${created.id}`,
      sourceType: "internal_shipment",
      sourceId: shipment.id,
      actorId: actor.userId,
    });
  }
  return shipment;
}

export async function uploadInternal(actor: Actor, shipmentId: string) {
  requirePermission(actor, "stock.write");
  const shipment = await getDb().internalShipment.findFirst({
    where: { id: shipmentId, organizationId: actor.organizationId },
    include: { lines: { include: { variant: true } }, organization: true },
  });
  if (!shipment) throw new BusinessError("გადაზიდვა ვერ მოიძებნა", "not_found");
  if (shipment.rsWaybillNumber) {
    if (shipment.status !== "completed") {
      await getDb().internalShipment.update({ where: { id: shipment.id }, data: { status: "completed" } });
    }
    return { ok: true as const, id: shipment.rsWaybillId ?? "", number: shipment.rsWaybillNumber };
  }
  if (!shipment.organization.identificationCode?.trim()) {
    const message = "ორგანიზაციის საიდენტიფიკაციო კოდი სავალდებულოა";
    await getDb().internalShipment.update({ where: { id: shipment.id }, data: { status: "rs_error", rsError: message } });
    return { ok: false as const, message };
  }
  const goods = shipment.lines.map((line) => ({
    name: line.description,
    quantity: D(line.quantity).toFixed(3),
    price: D(line.unitPrice).toFixed(4),
    amount: lineAmount(D(line.quantity), D(line.unitPrice), D(0)).toFixed(2),
    barCode: line.variant.barcode || line.variant.sku,
  }));
  const fullAmount = goods.reduce((sum, line) => sum.plus(D(line.amount)), D(0)).toFixed(2);
  const result = await pushWaybill(actor.organizationId, {
    id: Number(shipment.rsWaybillId || 0),
    type: 1,
    buyerTin: shipment.organization.identificationCode,
    buyerName: shipment.organization.legalName || shipment.organization.name,
    startAddress: shipment.startAddress,
    endAddress: shipment.endAddress,
    driverTin: shipment.driverTin,
    driverName: shipment.driverName,
    carNumber: shipment.carNumber,
    transportText: shipment.transportText,
    beginDate: shipment.beginOn ? shipment.beginOn.toISOString().slice(0, 10) : "",
    fullAmount,
    goods,
  });
  if (!result.ok) {
    await getDb().internalShipment.update({
      where: { id: shipment.id },
      data: { status: "rs_error", rsError: result.message, rsWaybillId: result.id ?? shipment.rsWaybillId },
    });
    return result;
  }
  await getDb().internalShipment.update({
    where: { id: shipment.id },
    data: { status: "completed", rsWaybillId: result.id, rsWaybillNumber: result.number, rsError: null },
  });
  return result;
}

export async function retryInternalUpload(actor: Actor, shipmentId: string, input: TransportInput) {
  const transport = readTransport({ ...input, waybillType: 1 });
  const shipment = await getDb().internalShipment.findFirst({
    where: { id: shipmentId, organizationId: actor.organizationId },
  });
  if (!shipment) throw new BusinessError("გადაზიდვა ვერ მოიძებნა", "not_found");
  await getDb().internalShipment.update({ where: { id: shipment.id }, data: transportData(transport) });
  return uploadInternal(actor, shipment.id);
}
