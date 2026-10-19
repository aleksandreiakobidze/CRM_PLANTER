import { describe, expect, it } from "vitest";
import { updateListPrice } from "@/server/features/catalog/catalog-service";
import { createCustomer } from "@/server/features/crm/customer-service";
import { createInvoiceFromOrder } from "@/server/features/finance/invoice-service";
import { getDb } from "@/server/db";
import { D } from "@/server/money";
import { confirmOrder, convertQuoteToOrder, createQuote, fulfillOrder } from "@/server/features/sales/order-service";
import { makeSellable, makeWorld } from "../helpers";

describe("გაყიდვის გზა", () => {
  it("შეთავაზება ერთხელ ხდება შეკვეთა, მიწოდება ერთხელ ჩამოწერს, ინვოისი კი არა", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `SKU-SALE-${actor.userId.slice(-4)}`, "4", "6");
    const customer = await createCustomer(actor, { kind: "company", name: "სატესტო კომპანია" });
    const quote = await createQuote(actor, {
      customerId: customer.id,
      lines: [{ variantId: variant.id, quantity: "2", unitPrice: "15" }],
    });
    const first = await convertQuoteToOrder(actor, quote.id);
    const second = await convertQuoteToOrder(actor, quote.id);
    expect(second.id).toBe(first.id);
    await confirmOrder(actor, first.id);
    const fulfillment = await fulfillOrder(actor, first.id);
    const fulfillmentAgain = await fulfillOrder(actor, first.id);
    expect(fulfillmentAgain.id).toBe(fulfillment.id);
    const beforeInvoice = await getDb().stockMovement.count({ where: { variantId: variant.id } });
    const invoice = await createInvoiceFromOrder(actor, first.id);
    const invoiceAgain = await createInvoiceFromOrder(actor, first.id);
    expect(invoiceAgain.id).toBe(invoice.id);
    const afterInvoice = await getDb().stockMovement.count({ where: { variantId: variant.id } });
    expect(afterInvoice).toBe(beforeInvoice);
    expect(D(invoice.total).toFixed(2)).toBe("30.00");
    await updateListPrice(actor, variant.id, "99");
    const line = await getDb().quoteLine.findFirstOrThrow({ where: { quoteId: quote.id } });
    const stored = await getDb().invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(D(line.unitPrice).toFixed(2)).toBe("15.00");
    expect(D(stored.total).toFixed(2)).toBe("30.00");
  });
});
