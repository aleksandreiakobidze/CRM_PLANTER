import { describe, expect, it } from "vitest";
import { createVariant } from "@/server/features/catalog/catalog-service";
import { createCustomer } from "@/server/features/crm/customer-service";
import { listDriverDay, createDeliveryTask, setRouteStops, upsertRoute } from "@/server/features/delivery/delivery-service";
import { confirmBankRow, importBankFile } from "@/server/features/finance/bank-import-service";
import { createInvoiceFromOrder } from "@/server/features/finance/invoice-service";
import {
  advanceBatchStage,
  createGrowthBatch,
  createInventoryCount,
  postInventoryCount,
  repotBatch,
  setCountQuantities,
} from "@/server/features/greenhouse/greenhouse-service";
import { postOpeningStock } from "@/server/features/inventory/stock-service";
import { addLandedCost, createPurchaseOrder, createSupplier, receivePurchase, submitPurchaseOrder } from "@/server/features/purchase/purchase-service";
import { opsDashboard } from "@/server/features/reports/ops-reports";
import { confirmOrder, convertQuoteToOrder, createQuote, fulfillOrder, returnSoldGoods } from "@/server/features/sales/order-service";
import { getDb } from "@/server/db";
import { D } from "@/server/money";
import { makeSellable, makeWorld } from "../helpers";

describe("შესყიდვა", () => {
  it("ნაწილობრივი მიღება, landed cost ჯამი = ხარჯი, იგივე posting key იგივეა", async () => {
    const { actor } = await makeWorld();
    const variant = await createVariant(actor, {
      category: "plant",
      productName: "PO მცენარე",
      sku: `PO-${actor.userId.slice(-4)}`,
      variantName: "PO",
      listPrice: "12",
    });
    const supplier = await createSupplier(actor, { name: "სატესტო მიმწოდებელი" });
    const greenhouse = await getDb().location.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: actor.organizationId, code: "greenhouse" } },
    });
    const po = await createPurchaseOrder(actor, {
      supplierId: supplier.id,
      postingKey: `po:${variant.id}`,
      lines: [{ variantId: variant.id, quantity: "10", unitPrice: "4" }],
    });
    await submitPurchaseOrder(actor, po.id);
    const line = await getDb().purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    const first = await receivePurchase(actor, {
      purchaseOrderId: po.id,
      locationId: greenhouse.id,
      postingKey: `gr:${po.id}:1`,
      lines: [{ purchaseLineId: line.id, quantity: "4" }],
    });
    const again = await receivePurchase(actor, {
      purchaseOrderId: po.id,
      locationId: greenhouse.id,
      postingKey: `gr:${po.id}:1`,
      lines: [{ purchaseLineId: line.id, quantity: "4" }],
    });
    expect(again.id).toBe(first.id);
    const refreshed = await getDb().purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    expect(refreshed.status).toBe("partial");
    const landed = await addLandedCost(actor, {
      purchaseOrderId: po.id,
      kind: "actual",
      amount: "15.00",
      postingKey: `lc:${po.id}`,
    });
    const allocations = await getDb().landedCostAllocation.findMany({ where: { landedCostId: landed.id } });
    const allocated = allocations.reduce((sum, row) => sum.plus(D(row.amount)), D("0"));
    const expense = await getDb().expense.findUniqueOrThrow({ where: { postingKey: `lc:${po.id}:expense` } });
    expect(allocated.toFixed(2)).toBe("15.00");
    expect(D(expense.amount).toFixed(2)).toBe("15.00");
    const balance = await getDb().stockBalance.findFirstOrThrow({
      where: { variantId: variant.id, locationId: greenhouse.id },
    });
    expect(D(balance.onHand).toFixed(3)).toBe("4.000");
  });
});

describe("სათბური", () => {
  it("გადარგვა ძველს ამცირებს, ახალს ზრდის, ზრდა არ ამრავლებს", async () => {
    const { actor } = await makeWorld();
    const greenhouse = await getDb().location.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: actor.organizationId, code: "greenhouse" } },
    });
    const from = await createVariant(actor, {
      category: "plant",
      productName: "ნერგი",
      sku: `FROM-${actor.userId.slice(-4)}`,
      variantName: "ნერგი",
      listPrice: "5",
    });
    const to = await createVariant(actor, {
      category: "plant",
      productName: "ქოთანი",
      sku: `TO-${actor.userId.slice(-4)}`,
      variantName: "გადარგული",
      listPrice: "15",
    });
    const pot = await createVariant(actor, {
      category: "pot",
      productName: "ქოთანი",
      sku: `POT-${actor.userId.slice(-4)}`,
      variantName: "ქოთანი",
      listPrice: "2",
    });
    await postOpeningStock(actor, {
      variantId: from.id,
      locationId: greenhouse.id,
      quantity: "5",
      unitCost: "3",
      postingKey: `open-from:${from.id}`,
    });
    await postOpeningStock(actor, {
      variantId: pot.id,
      locationId: greenhouse.id,
      quantity: "5",
      unitCost: "1",
      postingKey: `open-pot:${pot.id}`,
    });
    const batch = await createGrowthBatch(actor, {
      variantId: from.id,
      locationId: greenhouse.id,
      quantity: "5",
      postingKey: `gb:${from.id}`,
    });
    await advanceBatchStage(actor, batch.id, "growing");
    const grown = await getDb().growthBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(grown.quantity.toString()).toBe("5");
    await repotBatch(actor, {
      fromVariantId: from.id,
      toVariantId: to.id,
      potVariantId: pot.id,
      locationId: greenhouse.id,
      plantQty: "2",
      potQty: "2",
      postingKey: `repot:${from.id}`,
    });
    const fromBal = await getDb().stockBalance.findFirstOrThrow({ where: { variantId: from.id, locationId: greenhouse.id } });
    const toBal = await getDb().stockBalance.findFirstOrThrow({ where: { variantId: to.id, locationId: greenhouse.id } });
    const potBal = await getDb().stockBalance.findFirstOrThrow({ where: { variantId: pot.id, locationId: greenhouse.id } });
    expect(D(fromBal.onHand).toFixed(3)).toBe("3.000");
    expect(D(toBal.onHand).toFixed(3)).toBe("2.000");
    expect(D(potBal.onHand).toFixed(3)).toBe("3.000");
  });

  it("ინვენტარიზაციის სხვაობა ledger-ზე ერთხელ იწერება", async () => {
    const { actor } = await makeWorld();
    const { variant, location } = await makeSellable(actor, `CNT-${actor.userId.slice(-4)}`, "5", "8");
    const count = await createInventoryCount(actor, { locationId: location.id, postingKey: `ic:${location.id}` });
    const line = "lines" in count ? count.lines.find((item) => item.variantId === variant.id) : null;
    const lineId = line?.id ?? (await getDb().inventoryCountLine.findFirstOrThrow({ where: { countId: count.id, variantId: variant.id } })).id;
    await setCountQuantities(actor, count.id, [{ lineId, countedQty: "4" }]);
    await postInventoryCount(actor, count.id);
    await postInventoryCount(actor, count.id);
    const moves = await getDb().stockMovement.findMany({
      where: { sourceType: "inventory_count", sourceId: count.id },
    });
    expect(moves).toHaveLength(1);
    const balance = await getDb().stockBalance.findFirstOrThrow({ where: { variantId: variant.id, locationId: location.id } });
    expect(D(balance.onHand).toFixed(3)).toBe("4.000");
  });
});

describe("დაბრუნება და ბანკი", () => {
  it("2-დან 3 ბლოკდება და დაზიანებული quarantine-შია", async () => {
    const { actor } = await makeWorld();
    const { variant, location } = await makeSellable(actor, `RET-${actor.userId.slice(-4)}`, "5", "6");
    const customer = await createCustomer(actor, { kind: "company", name: "დამბრუნებელი" });
    const quote = await createQuote(actor, { customerId: customer.id, lines: [{ variantId: variant.id, quantity: "3", unitPrice: "10" }] });
    const order = await convertQuoteToOrder(actor, quote.id);
    await confirmOrder(actor, order.id);
    await fulfillOrder(actor, order.id);
    const orderLine = await getDb().salesOrderLine.findFirstOrThrow({ where: { orderId: order.id } });
    await returnSoldGoods(actor, {
      orderId: order.id,
      postingKey: `sr:${order.id}:1`,
      reason: "ტესტი",
      lines: [{ orderLineId: orderLine.id, quantity: "2", condition: "damaged" }],
    });
    await expect(
      returnSoldGoods(actor, {
        orderId: order.id,
        postingKey: `sr:${order.id}:2`,
        reason: "ზედმეტი",
        lines: [{ orderLineId: orderLine.id, quantity: "2", condition: "healthy" }],
      }),
    ).rejects.toThrow(/აღემატება/);
    const quarantine = await getDb().location.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: actor.organizationId, code: "quarantine" } },
    });
    const qBal = await getDb().stockBalance.findFirstOrThrow({
      where: { variantId: variant.id, locationId: quarantine.id },
    });
    expect(D(qBal.onHand).toFixed(3)).toBe("2.000");
    const salesBal = await getDb().stockBalance.findFirstOrThrow({ where: { variantId: variant.id, locationId: location.id } });
    expect(D(salesBal.onHand).toFixed(3)).toBe("2.000");
  });

  it("იგივე ბანკის ფაილი მეორე გადახდას არ ქმნის", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `BNK-${actor.userId.slice(-4)}`, "1", "4");
    const customer = await createCustomer(actor, { kind: "company", name: "ბანკის კლიენტი" });
    const quote = await createQuote(actor, { customerId: customer.id, lines: [{ variantId: variant.id, quantity: "1", unitPrice: "20" }] });
    const order = await convertQuoteToOrder(actor, quote.id);
    await confirmOrder(actor, order.id);
    await fulfillOrder(actor, order.id);
    const invoice = await createInvoiceFromOrder(actor, order.id);
    const csv = Buffer.from("date,amount,purpose\n2026-10-19,20.00,ინვოისი\n", "utf8");
    const mapping = { date: "date", amount: "amount", purpose: "purpose" };
    const first = await importBankFile(actor, { filename: "bank.csv", bytes: csv, mapping });
    const second = await importBankFile(actor, { filename: "bank.csv", bytes: csv, mapping });
    expect(second.id).toBe(first.id);
    const row = first.rows[0];
    await confirmBankRow(actor, { rowId: row.id, customerId: customer.id, invoiceId: invoice.id });
    await confirmBankRow(actor, { rowId: row.id, customerId: customer.id, invoiceId: invoice.id });
    const payments = await getDb().payment.findMany({ where: { organizationId: actor.organizationId, kind: "payment" } });
    expect(payments).toHaveLength(1);
  });
});

describe("მძღოლი და რეპორტი", () => {
  it("მძღოლს delivery ჩანს და cost არა", async () => {
    const owner = await makeWorld("owner");
    const driverWorld = await makeWorld("driver");
    const driver = { ...driverWorld.actor, organizationId: owner.organizationId };
    const customer = await createCustomer(owner.actor, { kind: "company", name: "მისაწოდებელი" });
    const task = await createDeliveryTask(owner.actor, {
      sourceType: "order",
      sourceId: "order-1",
      customerId: customer.id,
      address: "თბილისი, ტესტი 1",
      phone: "555111222",
      quantityNote: "3 ქოთანი",
      instructions: "კარი კოდი 12",
      postingKey: `dl:${owner.organizationId}`,
    });
    const route = await upsertRoute(owner.actor, {
      date: "2026-10-20",
      driverId: driver.userId,
      postingKey: `route:${owner.organizationId}:2026-10-20`,
    });
    await setRouteStops(owner.actor, route.id, [task.id]);
    const view = await listDriverDay(driver, "2026-10-20");
    expect(view.hideCost).toBe(true);
    expect(view.routes[0]?.stops[0]?.address).toBe("თბილისი, ტესტი 1");
    expect(view.routes[0]?.stops[0]?.phone).toBe("555111222");
    const blob = JSON.stringify(view);
    expect(blob).not.toMatch(/unitCost|averageCost|თვითღირებულება|cogs/i);
  });

  it("რეპორტში sold ≠ invoiced ≠ received და დეპოზიტი excluded", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `RPT-${actor.userId.slice(-4)}`, "1", "5");
    const customer = await createCustomer(actor, { kind: "company", name: "რეპორტი" });
    const quote = await createQuote(actor, { customerId: customer.id, lines: [{ variantId: variant.id, quantity: "1", unitPrice: "40" }] });
    const order = await convertQuoteToOrder(actor, quote.id);
    await confirmOrder(actor, order.id);
    await fulfillOrder(actor, order.id);
    const report = await opsDashboard(actor, "2026-10-01", "2026-10-31");
    expect(report.sales.sold).toBe("40.00");
    expect(report.sales.invoiced).toBe("0.00");
    expect(report.sales.received).toBe("0.00");
    expect(report.sales.sold).not.toBe(report.sales.invoiced);
    expect(report.integration).toBe("მონაცემი არ არის");
  });
});
