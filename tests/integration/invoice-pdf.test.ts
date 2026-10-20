import { describe, expect, it } from "vitest";
import { createCustomer } from "@/server/features/crm/customer-service";
import { createInvoiceFromOrder, invoiceHtml, type InvoiceSnapshot } from "@/server/features/finance/invoice-service";
import { getDb } from "@/server/db";
import { confirmOrder, convertQuoteToOrder, createQuote, fulfillOrder } from "@/server/features/sales/order-service";
import { D, priceFromTarget } from "@/server/money";
import { makeSellable, makeWorld } from "../helpers";

describe("ინვოისის snapshot", () => {
  it("მისამართის შეცვლა ძველ HTML-ს არ ცვლის და ქართული ტექსტი რჩება", async () => {
    const { actor } = await makeWorld();
    const { variant } = await makeSellable(actor, `PDF-${actor.userId.slice(-4)}`, "21", "3");
    const customer = await createCustomer(actor, { kind: "company", name: "სატესტო მყიდველი PDF" });
    await getDb().address.create({
      data: { organizationId: actor.organizationId, customerId: customer.id, line1: "ძველი მისამართი 1" },
    });
    const priced = priceFromTarget(D("21"), D("1372"));
    const quote = await createQuote(actor, {
      customerId: customer.id,
      lines: [{ variantId: variant.id, quantity: "21", unitPrice: priced.unitPrice.toFixed(4), discountAmount: priced.adjustment.neg().toFixed(2) }],
    });
    const order = await convertQuoteToOrder(actor, quote.id);
    await confirmOrder(actor, order.id);
    await fulfillOrder(actor, order.id);
    const invoice = await createInvoiceFromOrder(actor, order.id);
    expect(D(invoice.total).toFixed(2)).toBe("1372.00");
    await getDb().address.updateMany({ where: { customerId: customer.id }, data: { line1: "ახალი მისამართი 9" } });
    await getDb().organization.update({ where: { id: actor.organizationId }, data: { address: "შეცვლილი იურიდიული მისამართი" } });
    const snapshot = invoice.snapshot as InvoiceSnapshot;
    const html = invoiceHtml(snapshot, invoice.number ?? "");
    expect(html).toContain("ინვოისი");
    expect(html).toContain("მიმწოდებელი");
    expect(html).toContain("მომსახურების მიმღები");
    expect(html).toContain("საბანკო რეკვიზიტები");
    expect(html).toContain("ძველი მისამართი 1");
    expect(html).not.toContain("ახალი მისამართი 9");
    expect(html).toContain("1,372.00");
    expect(html).not.toContain("21.000");
    expect(html).toContain("RS-ზე");
  });

  it("ძველ snapshot-ს დირექტორის გარეშე PDF არ უტეხს", () => {
    const html = invoiceHtml(
      {
        seller: {
          name: "Planter",
          legalName: "შპს პლანტერი",
          identificationCode: "123",
          address: "ძველი იურიდიული",
          bankName: "ბანკი",
          iban: "GE00TB0000000000000099",
        },
        buyer: {
          name: "მყიდველი",
          legalName: null,
          identificationCode: null,
          address: "ძველი მისამართი 1",
        },
        currency: "GEL",
        lines: [
          {
            description: "მცენარის გაქირავება",
            quantity: "21.000",
            unitPrice: "65.3333",
            discountAmount: "0.00",
            taxAmount: "0.00",
            lineTotal: "1372.00",
          },
        ],
        subtotal: "1372.00",
        taxTotal: "0.00",
        adjustment: "0.00",
        total: "1372.00",
        issuedOn: "2026-10-16",
        taxMode: "inclusive",
        fiscalNote: "ეს არ არის RS-ზე რეგისტრირებული საგადასახადო დოკუმენტი.",
      },
      "INV-1",
    );
    expect(html).toContain("16 ოქტომბერი 2026");
    expect(html).toContain(">21<");
    expect(html).toContain("1,372.00");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("დირექტორი:");
  });
});
