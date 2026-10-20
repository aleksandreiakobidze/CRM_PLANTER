import { afterEach, describe, expect, it } from "vitest";
import { createCustomer } from "@/server/features/crm/customer-service";
import { createInvoiceFromOrder } from "@/server/features/finance/invoice-service";
import { setWaybillTransport } from "@/server/features/integrations/rs-waybill";
import { completeInternalShipment, completeSale, retrySaleUpload, saveRsCredentials } from "@/server/features/integrations/waybill-service";
import { bookRental, createRentalAsset } from "@/server/features/rental/rental-service";
import { confirmOrder, createSalesOrder } from "@/server/features/sales/order-service";
import { getDb } from "@/server/db";
import { D } from "@/server/money";
import { makeSellable, makeWorld } from "../helpers";

const transport = {
  waybillType: 2 as const,
  driverTin: "01001001001",
  driverName: "სატესტო მძღოლი",
  carNumber: "AA000AA",
  transportText: "ფურგონი",
  startAddress: "თბილისი, საწყობი",
  endAddress: "თბილისი, ობიექტი",
  beginOn: "2026-10-20",
};

afterEach(() => {
  setWaybillTransport(null);
});

async function saleReady() {
  const world = await makeWorld();
  const { variant } = await makeSellable(world.actor, `WB-${world.actor.userId.slice(-4)}`, "6", "4");
  const customer = await createCustomer(world.actor, { kind: "company", name: "ზედნადების კლიენტი", identificationCode: "400000111" });
  const order = await createSalesOrder(world.actor, {
    customerId: customer.id,
    postingKey: `order:${variant.id}`,
    lines: [
      { variantId: variant.id, quantity: "2", unitPrice: "15" },
      { variantId: variant.id, quantity: "1", unitPrice: "10" },
    ],
  });
  return { ...world, variant, order };
}

describe("შეკვეთა და RS ზედნადები", () => {
  it("ღია შეკვეთა ნაშთს არ წერს, ავტორიზება რეზერვავს, დასრულება ერთხელ ჩამოწერს", async () => {
    const { actor, variant, order } = await saleReady();
    const before = await getDb().stockMovement.count({ where: { variantId: variant.id, movementType: "sale_issue" } });
    expect(before).toBe(0);
    expect(order.status).toBe("open");
    await confirmOrder(actor, order.id);
    const reserved = await getDb().stockBalance.findFirstOrThrow({ where: { variantId: variant.id } });
    expect(D(reserved.reserved).toFixed(3)).toBe("3.000");
    const failed = await completeSale(actor, { ...transport, orderId: order.id, createInvoice: false });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.message).toContain("კონფიგურირებული");
    const issued = await getDb().salesOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(issued.status).toBe("rs_error");
    const issues = await getDb().stockMovement.count({ where: { variantId: variant.id, movementType: "sale_issue" } });
    expect(issues).toBe(2);
    await retrySaleUpload(actor, { ...transport, orderId: order.id, createInvoice: false });
    const issuesAgain = await getDb().stockMovement.count({ where: { variantId: variant.id, movementType: "sale_issue" } });
    expect(issuesAgain).toBe(issues);
    const fulfillment = await getDb().fulfillment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(fulfillment.rsWaybillNumber).toBeNull();
  });

  it("RS შეცდომა ჩანს და მეორე ატვირთვა მარაგს არ ამცირებს", async () => {
    const { actor, variant, order } = await saleReady();
    await getDb().organization.update({ where: { id: actor.organizationId }, data: { taxMode: "exclusive" } });
    await saveRsCredentials(actor, { su: "su", sp: "sp" });
    setWaybillTransport(async (action) => {
      if (action === "save_waybill") return "<STATUS>-5</STATUS><ERROR>მძღოლის პირადი არასწორია</ERROR>";
      return "<send_waybillResult>-1</send_waybillResult>";
    });
    await confirmOrder(actor, order.id);
    const first = await completeSale(actor, { ...transport, orderId: order.id, createInvoice: true });
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.message).toContain("მძღოლის პირადი");
    const beforeRetry = await getDb().stockMovement.count({ where: { variantId: variant.id, movementType: "sale_issue" } });
    const again = await retrySaleUpload(actor, { ...transport, orderId: order.id, createInvoice: true });
    expect(again.ok).toBe(false);
    const issues = await getDb().stockMovement.count({ where: { variantId: variant.id, movementType: "sale_issue" } });
    expect(issues).toBe(beforeRetry);
    expect(issues).toBe(2);
    const invoices = await getDb().invoice.count({ where: { orderId: order.id } });
    expect(invoices).toBe(0);
  });

  it("წარმატებული ნომერი ერთხელ იწერება და ავტო-ინვოისი ერთია", async () => {
    const { actor, order } = await saleReady();
    await getDb().organization.update({ where: { id: actor.organizationId }, data: { taxMode: "exclusive", autoInvoiceAfterWaybill: true } });
    await saveRsCredentials(actor, { su: "su", sp: "sp" });
    let saves = 0;
    setWaybillTransport(async (action) => {
      if (action === "save_waybill") {
        saves += 1;
        return "<STATUS>0</STATUS><ID>1551</ID>";
      }
      return "<send_waybillResult>0000014722</send_waybillResult>";
    });
    await confirmOrder(actor, order.id);
    const first = await completeSale(actor, { ...transport, orderId: order.id, createInvoice: true });
    const second = await completeSale(actor, { ...transport, orderId: order.id, createInvoice: true });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.number).toBe(first.number);
    expect(saves).toBe(1);
    const stored = await getDb().salesOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.status).toBe("completed");
    const invoice = await createInvoiceFromOrder(actor, order.id);
    const invoices = await getDb().invoice.findMany({ where: { orderId: order.id } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.id).toBe(invoice.id);
    expect(D(invoice.total).toFixed(2)).toBe("40.00");
  });
});

describe("შიდა გადაზიდვა და გაქირავების ხაზები", () => {
  it("შიდა გადაზიდვა ერთხელ გადააქვს და ინვოისს არ ქმნის", async () => {
    const { actor } = await makeWorld();
    await getDb().organization.update({ where: { id: actor.organizationId }, data: { autoInvoiceAfterWaybill: true, taxMode: "exclusive" } });
    const { variant, location } = await makeSellable(actor, `IN-${actor.userId.slice(-4)}`, "5", "3");
    const warehouse = await getDb().location.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: actor.organizationId, code: "warehouse" } },
    });
    const input = {
      ...transport,
      waybillType: 1 as const,
      fromLocationId: location.id,
      toLocationId: warehouse.id,
      postingKey: `ship:${variant.id}`,
      lines: [{ variantId: variant.id, quantity: "2" }],
    };
    await completeInternalShipment(actor, input);
    await completeInternalShipment(actor, input);
    const moves = await getDb().stockMovement.count({ where: { variantId: variant.id, movementType: "transfer_out" } });
    expect(moves).toBe(1);
    const invoices = await getDb().invoice.count({ where: { organizationId: actor.organizationId } });
    expect(invoices).toBe(0);
    const from = await getDb().stockBalance.findFirstOrThrow({ where: { variantId: variant.id, locationId: location.id } });
    expect(D(from.onHand).toFixed(3)).toBe("3.000");
  });

  it("გაქირავების ორი ხაზი ორ რეზერვს ხსნის", async () => {
    const { actor } = await makeWorld();
    const first = await createRentalAsset(actor, { variantId: (await makeSellable(actor, `R1-${actor.userId.slice(-4)}`, "1")).variant.id, code: "RA-1" });
    const second = await createRentalAsset(actor, { variantId: (await makeSellable(actor, `R2-${actor.userId.slice(-4)}`, "1")).variant.id, code: "RA-2" });
    const customer = await createCustomer(actor, { kind: "company", name: "გაქირავების კლიენტი" });
    const booking = await bookRental(actor, {
      customerId: customer.id,
      assetIds: [first.id, second.id],
      lines: [
        { assetId: first.id, unitPrice: "30" },
        { assetId: second.id, unitPrice: "20" },
      ],
      startOn: "2026-11-21",
      endOn: "2026-11-23",
      priceModel: "line",
      depositAmount: "5",
      postingKey: `rent:${first.id}`,
    });
    expect(D(booking.total).toFixed(2)).toBe("50.00");
    const reservations = await getDb().assetReservation.findMany({ where: { bookingId: booking.id } });
    expect(reservations).toHaveLength(2);
    const lines = await getDb().rentalBookingLine.findMany({ where: { bookingId: booking.id } });
    expect(lines.map((line) => D(line.lineTotal).toFixed(2)).sort()).toEqual(["20.00", "30.00"]);
  });
});
