import { describe, expect, it } from "vitest";
import { createCustomer } from "@/server/features/crm/customer-service";
import { createManualInvoice, postDraftInvoice, updateDraftInvoice } from "@/server/features/finance/invoice-service";
import { salesReport } from "@/server/features/reports/sales-report";
import { getDb } from "@/server/db";
import { D } from "@/server/money";
import { tbilisiDateString } from "@/server/time";
import { withTx } from "@/server/tx";
import { makeSellable, makeWorld } from "../helpers";

describe("sales report", () => {
  it("groups posted invoices by customer, product, manager and source", async () => {
    const { actor } = await makeWorld();
    const today = tbilisiDateString();
    const { variant } = await makeSellable(actor, `SKU-SR-${actor.userId.slice(-4)}`, "10", "4");
    const owned = await createCustomer(actor, { kind: "company", name: "მენეჯერის კლიენტი" });
    const free = await createCustomer(actor, { kind: "company", name: "თავისუფალი კლიენტი" });
    await getDb().customer.update({ where: { id: owned.id }, data: { ownerId: actor.userId } });
    await getDb().customer.update({ where: { id: free.id }, data: { ownerId: null } });

    const invoice = async (customerId: string, sourceType: string, lines: Parameters<typeof updateDraftInvoice>[2]["lines"], post = true) => {
      const draft = await withTx((tx) =>
        createManualInvoice(tx, actor, {
          postingKey: `sr:${customerId}:${sourceType}:${lines.length}:${post}`,
          customerId,
          sourceType,
          sourceId: customerId,
          forceDraft: true,
          lines: [{ description: "დროებითი", quantity: D("1"), unitPrice: D("1"), lineTotal: D("1") }],
        }),
      );
      await updateDraftInvoice(actor, draft.id, { customerId, lines });
      return post ? postDraftInvoice(actor, draft.id) : draft;
    };
    await invoice(owned.id, "sales_order", [{ variantId: variant.id, quantity: "3", unitPrice: "20" }]);
    await invoice(free.id, "excursion", [
      { description: "ექსკურსია", quantity: "10", unitPrice: "15" },
      { variantId: variant.id, quantity: "1", unitPrice: "20" },
    ]);
    await invoice(free.id, "excursion", [{ description: "დრაფტი", quantity: "1", unitPrice: "999" }], false);

    const report = await salesReport(actor, { from: today, to: today });
    expect(report.totals.invoices).toBe(2);
    expect(report.totals.net?.toFixed(2)).toBe("230.00");
    expect(report.breakdowns.customers.map((row) => [row.label, row.amount.toFixed(2)])).toEqual([
      ["თავისუფალი კლიენტი", "170.00"],
      ["მენეჯერის კლიენტი", "60.00"],
    ]);
    const product = report.breakdowns.products.find((row) => row.key === variant.id);
    expect(product?.quantity.toNumber()).toBe(4);
    expect(product?.amount.toFixed(2)).toBe("80.00");
    expect(report.breakdowns.owners.find((row) => row.key === actor.userId)?.amount.toFixed(2)).toBe("60.00");
    expect(report.breakdowns.sources.map((row) => row.key)).toEqual(["excursion", "sales_order"]);

    const mine = await salesReport(actor, { from: today, to: today, ownerId: actor.userId });
    expect(mine.rows.map((row) => row.customer)).toEqual(["მენეჯერის კლიენტი"]);
    const excursions = await salesReport(actor, { from: today, to: today, source: "excursion" });
    expect(excursions.totals.net?.toFixed(2)).toBe("170.00");
  });
});
