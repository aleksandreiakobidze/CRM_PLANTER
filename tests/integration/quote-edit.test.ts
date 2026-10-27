import { describe, expect, it } from "vitest";
import { createCustomer } from "@/server/features/crm/customer-service";
import { getDb } from "@/server/db";
import { convertQuoteToOrder, createQuote, setQuoteStatus, updateQuote } from "@/server/features/sales/order-service";
import { D } from "@/server/money";
import { makeSellable, makeWorld } from "../helpers";

describe("quote editing and status", () => {
  it("replaces lines, recalculates totals and follows the status flow", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `SKU-QE-${actor.userId.slice(-4)}`, "5", "4");
    const customer = await createCustomer(actor, { kind: "company", name: "შეთავაზების კლიენტი" });
    const quote = await createQuote(actor, { customerId: customer.id, validUntil: "2026-12-01", lines: [{ variantId: variant.id, quantity: "1", unitPrice: "20" }] });
    expect(quote.validUntil?.toISOString().slice(0, 10)).toBe("2026-12-01");

    await setQuoteStatus(actor, quote.id, "sent");
    const updated = await updateQuote(actor, quote.id, {
      customerId: customer.id,
      notes: "ახალი პირობები",
      lines: [
        { variantId: variant.id, quantity: "3", unitPrice: "20", discountAmount: "5" },
        { kind: "greening", quantity: "1", unitPrice: "100", description: "გამწვანება" },
      ],
    });
    expect(updated.lines).toHaveLength(2);
    expect(updated.lines.reduce((sum, line) => sum.plus(line.lineTotal), D(0)).toFixed(2)).toBe("155.00");

    await setQuoteStatus(actor, quote.id, "declined");
    await expect(updateQuote(actor, quote.id, { customerId: customer.id, lines: [{ variantId: variant.id, quantity: "1" }] })).rejects.toThrow();
    await expect(convertQuoteToOrder(actor, quote.id)).rejects.toThrow();
    await expect(setQuoteStatus(actor, quote.id, "sent")).rejects.toThrow();

    await setQuoteStatus(actor, quote.id, "draft");
    await setQuoteStatus(actor, quote.id, "accepted");
    const order = await convertQuoteToOrder(actor, quote.id);
    const after = await getDb().quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(after.status).toBe("converted");
    expect(order.quoteId).toBe(quote.id);
    const events = await getDb().auditLog.findMany({ where: { entityType: "quote", entityId: quote.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((event) => event.action)).toEqual(["quote.create", "quote.sent", "quote.update", "quote.declined", "quote.draft", "quote.accepted", "quote.converted"]);
  });
});
