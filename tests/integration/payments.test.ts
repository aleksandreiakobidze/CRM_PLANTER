import { describe, expect, it } from "vitest";
import { createCustomer } from "@/server/features/crm/customer-service";
import { createInvoiceFromOrder, invoiceBalance } from "@/server/features/finance/invoice-service";
import { recordPayment, refundPayment } from "@/server/features/finance/payment-service";
import { salesDashboard } from "@/server/features/reports/dashboard-service";
import { getDb } from "@/server/db";
import { confirmOrder, convertQuoteToOrder, createQuote, fulfillOrder } from "@/server/features/sales/order-service";
import { makeSellable, makeWorld } from "../helpers";

describe("გადახდა", () => {
  it("ნაწილობრივი გადახდა სწორ ნაშთს ტოვებს და ზედმეტს ბლოკავს", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `SKU-PAY-${actor.userId.slice(-4)}`, "2", "4");
    const customer = await createCustomer(actor, { kind: "company", name: "სატესტო გადამხდელი" });
    const quote = await createQuote(actor, { customerId: customer.id, lines: [{ variantId: variant.id, quantity: "1", unitPrice: "20" }] });
    const order = await convertQuoteToOrder(actor, quote.id);
    await confirmOrder(actor, order.id);
    await fulfillOrder(actor, order.id);
    const invoice = await createInvoiceFromOrder(actor, order.id);
    await recordPayment(actor, {
      customerId: customer.id,
      amount: "8",
      method: "bank",
      paidOn: "2026-10-19",
      postingKey: `pay-${invoice.id}`,
      allocations: [{ invoiceId: invoice.id, amount: "8" }],
    });
    await recordPayment(actor, {
      customerId: customer.id,
      amount: "8",
      method: "bank",
      paidOn: "2026-10-19",
      postingKey: `pay-${invoice.id}`,
      allocations: [{ invoiceId: invoice.id, amount: "8" }],
    });
    const balance = await invoiceBalance(invoice.id);
    expect(balance.remaining.toFixed(2)).toBe("12.00");
    await expect(
      recordPayment(actor, {
        customerId: customer.id,
        amount: "13",
        method: "cash",
        paidOn: "2026-10-19",
        postingKey: `pay-over-${invoice.id}`,
        allocations: [{ invoiceId: invoice.id, amount: "13" }],
      }),
    ).rejects.toThrow(/აღემატება/);
    const payment = await getDb().payment.findUniqueOrThrow({ where: { postingKey: `pay-${invoice.id}` } });
    await refundPayment(actor, { paymentId: payment.id, amount: "8", postingKey: `refund-${payment.id}`, paidOn: "2026-10-20" });
    await expect(refundPayment(actor, { paymentId: payment.id, amount: "1", postingKey: `refund-extra-${payment.id}`, paidOn: "2026-10-20" })).rejects.toThrow(/აღემატება/);
  });
});

describe("დაშბორდი", () => {
  it("გაყიდულს, დარიცხულს და შემოსულს არ ურევს და დეპოზიტს არ ამატებს", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `SKU-DASH-${actor.userId.slice(-4)}`, "1", "5");
    const customer = await createCustomer(actor, { kind: "company", name: "სატესტო დაშბორდი" });
    const quote = await createQuote(actor, { customerId: customer.id, lines: [{ variantId: variant.id, quantity: "1", unitPrice: "40" }] });
    const order = await convertQuoteToOrder(actor, quote.id);
    await confirmOrder(actor, order.id);
    await fulfillOrder(actor, order.id);
    const invoice = await createInvoiceFromOrder(actor, order.id);
    await recordPayment(actor, {
      customerId: customer.id,
      amount: "10",
      method: "bank",
      paidOn: "2026-10-19",
      postingKey: `dash-pay-${invoice.id}`,
      allocations: [{ invoiceId: invoice.id, amount: "10" }],
    });
    await getDb().depositTransaction.create({
      data: { organizationId: actor.organizationId, kind: "hold", amount: "50.00", postingKey: `dep-${invoice.id}` },
    });
    const report = await salesDashboard(actor, "2026-10-01", "2026-10-31");
    expect(report.sold).toBe("40.00");
    expect(report.invoiced).toBe("40.00");
    expect(report.received).toBe("10.00");
    expect(report.received).not.toBe(report.invoiced);
  });
});
