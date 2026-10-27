import { describe, expect, it } from "vitest";
import { createVariant } from "@/server/features/catalog/catalog-service";
import { createPurchaseOrder, createSupplier, receivePurchase, submitPurchaseOrder, updatePurchaseOrder } from "@/server/features/purchase/purchase-service";
import { getDb } from "@/server/db";
import { D } from "@/server/money";
import { makeWorld } from "../helpers";

describe("purchase header and lines", () => {
  it("edits a draft, then receives several lines at once and skips zero lines", async () => {
    const { actor } = await makeWorld();
    const a = await createVariant(actor, { category: "plant", productName: "A", sku: "", variantName: "A", listPrice: "10" });
    const b = await createVariant(actor, { category: "plant", productName: "B", sku: "", variantName: "B", listPrice: "10" });
    const c = await createVariant(actor, { category: "plant", productName: "C", sku: "", variantName: "C", listPrice: "10" });
    const supplier = await createSupplier(actor, { name: "მიმწოდებელი" });
    const greenhouse = await getDb().location.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: actor.organizationId, code: "greenhouse" } },
    });
    const po = await createPurchaseOrder(actor, {
      supplierId: supplier.id,
      postingKey: `po:${a.id}`,
      lines: [{ variantId: a.id, quantity: "1", unitPrice: "1" }],
    });
    await updatePurchaseOrder(actor, po.id, {
      supplierId: supplier.id,
      notes: "შეცვლილი",
      lines: [
        { variantId: a.id, quantity: "5", unitPrice: "2" },
        { variantId: b.id, quantity: "3", unitPrice: "4" },
        { variantId: c.id, quantity: "2", unitPrice: "1" },
      ],
    });
    const lines = await getDb().purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id }, orderBy: { sort: "asc" } });
    expect(lines).toHaveLength(3);
    expect(lines.reduce((sum, line) => sum.plus(line.lineTotal), D(0)).toFixed(2)).toBe("24.00");

    await submitPurchaseOrder(actor, po.id);
    await expect(updatePurchaseOrder(actor, po.id, { supplierId: supplier.id, lines: [{ variantId: a.id, quantity: "1", unitPrice: "1" }] })).rejects.toThrow();

    await receivePurchase(actor, {
      purchaseOrderId: po.id,
      locationId: greenhouse.id,
      postingKey: `gr:${po.id}:multi`,
      lines: [
        { purchaseLineId: lines[0].id, quantity: "5" },
        { purchaseLineId: lines[1].id, quantity: "1" },
        { purchaseLineId: lines[2].id, quantity: "0" },
      ],
    });
    const after = await getDb().purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id }, orderBy: { sort: "asc" } });
    expect(after.map((line) => D(line.receivedQty).toFixed(0))).toEqual(["5", "1", "0"]);
    const order = await getDb().purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    expect(order.status).toBe("partial");
    await expect(
      receivePurchase(actor, {
        purchaseOrderId: po.id,
        locationId: greenhouse.id,
        postingKey: `gr:${po.id}:empty`,
        lines: [{ purchaseLineId: lines[2].id, quantity: "" }],
      }),
    ).rejects.toThrow();
  });
});
