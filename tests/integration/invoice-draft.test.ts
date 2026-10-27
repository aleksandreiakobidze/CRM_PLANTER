import { describe, expect, it } from "vitest";
import { createCustomer } from "@/server/features/crm/customer-service";
import { createManualInvoice, postDraftInvoice, updateDraftInvoice } from "@/server/features/finance/invoice-service";
import { getDb } from "@/server/db";
import { D } from "@/server/money";
import { withTx } from "@/server/tx";
import { makeSellable, makeWorld } from "../helpers";

describe("draft invoice", () => {
  it("edits lines while draft, posts once with a number and snapshot, then locks", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `SKU-INV-${actor.userId.slice(-4)}`, "3", "4");
    const customer = await createCustomer(actor, { kind: "company", name: "ინვოისის კლიენტი" });
    const draft = await withTx((tx) =>
      createManualInvoice(tx, actor, {
        postingKey: `draft:${customer.id}`,
        customerId: customer.id,
        sourceType: "excursion",
        sourceId: customer.id,
        forceDraft: true,
        lines: [{ description: "ექსკურსია", quantity: D("10"), unitPrice: D("15"), lineTotal: D("150") }],
      }),
    );
    expect(draft.status).toBe("draft");
    expect(draft.number).toBeNull();

    const updated = await updateDraftInvoice(actor, draft.id, {
      customerId: customer.id,
      dueOn: "2026-12-31",
      lines: [
        { description: "ექსკურსია", quantity: "12", unitPrice: "15" },
        { variantId: variant.id, quantity: "2", unitPrice: "20", discountAmount: "5" },
      ],
    });
    expect(D(updated.total).toFixed(2)).toBe("215.00");
    const lines = await getDb().invoiceLine.findMany({ where: { invoiceId: draft.id }, orderBy: { sort: "asc" } });
    expect(lines.map((line) => line.description)).toEqual(["ექსკურსია", variant.nameKa]);

    const posted = await postDraftInvoice(actor, draft.id);
    expect(posted.status).toBe("posted");
    expect(posted.number).toMatch(/^INV-/);
    expect(posted.snapshot).toBeTruthy();
    expect(posted.dueOn?.toISOString().slice(0, 10)).toBe("2026-12-31");
    await expect(postDraftInvoice(actor, draft.id)).rejects.toThrow();
    await expect(updateDraftInvoice(actor, draft.id, { customerId: customer.id, lines: [{ description: "x", quantity: "1", unitPrice: "1" }] })).rejects.toThrow();
  });
});
