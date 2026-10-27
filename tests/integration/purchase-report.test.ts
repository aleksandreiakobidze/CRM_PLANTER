import { describe, expect, it } from "vitest";
import { createVariant } from "@/server/features/catalog/catalog-service";
import { createPurchaseOrder, createSupplier, receivePurchase, submitPurchaseOrder } from "@/server/features/purchase/purchase-service";
import { purchaseReport } from "@/server/features/reports/purchase-report";
import { getDb } from "@/server/db";
import { tbilisiDateString } from "@/server/time";
import { makeWorld } from "../helpers";

describe("purchase report", () => {
  it("shows ordered, received and outstanding per order, supplier and product", async () => {
    const { actor } = await makeWorld();
    const today = tbilisiDateString();
    const a = await createVariant(actor, { category: "plant", productName: "PA", sku: "", variantName: "PA", listPrice: "10" });
    const b = await createVariant(actor, { category: "plant", productName: "PB", sku: "", variantName: "PB", listPrice: "10" });
    const north = await createSupplier(actor, { name: "ჩრდილოეთი" });
    const south = await createSupplier(actor, { name: "სამხრეთი" });
    const greenhouse = await getDb().location.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: actor.organizationId, code: "greenhouse" } },
    });
    const first = await createPurchaseOrder(actor, {
      supplierId: north.id,
      postingKey: `prr:${a.id}`,
      lines: [
        { variantId: a.id, quantity: "10", unitPrice: "2" },
        { variantId: b.id, quantity: "4", unitPrice: "5" },
      ],
    });
    await createPurchaseOrder(actor, { supplierId: south.id, postingKey: `prr:${b.id}`, lines: [{ variantId: b.id, quantity: "2", unitPrice: "5" }] });
    await submitPurchaseOrder(actor, first.id);
    const lines = await getDb().purchaseOrderLine.findMany({ where: { purchaseOrderId: first.id }, orderBy: { sort: "asc" } });
    await receivePurchase(actor, {
      purchaseOrderId: first.id,
      locationId: greenhouse.id,
      postingKey: `prr-gr:${first.id}`,
      lines: [
        { purchaseLineId: lines[0].id, quantity: "6" },
        { purchaseLineId: lines[1].id, quantity: "4" },
      ],
    });

    const report = await purchaseReport(actor, { from: today, to: today });
    expect(report.totals.orders).toBe(2);
    expect(report.totals.ordered?.toFixed(2)).toBe("50.00");
    expect(report.totals.received?.toFixed(2)).toBe("32.00");
    expect(report.totals.outstanding?.toFixed(2)).toBe("18.00");
    expect(report.totals.receipts).toBe(1);
    expect(report.totals.receiptValue?.toFixed(2)).toBe("32.00");
    expect(report.outstandingLines.map((row) => [row.name, row.open.toNumber()])).toEqual([["PA", 4]]);
    expect(report.breakdowns.suppliers.map((row) => [row.label, row.amount.toFixed(2)])).toEqual([
      ["ჩრდილოეთი", "40.00"],
      ["სამხრეთი", "10.00"],
    ]);
    expect(report.breakdowns.products.find((row) => row.key === b.id)?.quantity.toNumber()).toBe(6);

    const southOnly = await purchaseReport(actor, { from: today, to: today, supplierId: south.id });
    expect(southOnly.rows.map((row) => row.status)).toEqual(["draft"]);
    expect(southOnly.outstandingLines).toHaveLength(0);
  });
});
