import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { audit } from "@/server/audit";
import { getDb, type Tx } from "@/server/db";
import { BusinessError, isUniqueViolation } from "@/server/errors";
import { D, Decimal, moneyPrint, moneyText, priceFromTarget, roundMoney } from "@/server/money";
import { nextNumber } from "@/server/numbers";
import { formatDateOnly, formatGeorgianLongDate, formatGeorgianShortDate, tbilisiDateString } from "@/server/time";
import { withTx } from "@/server/tx";

export type InvoiceSnapshot = {
  seller: {
    name: string;
    legalName: string | null;
    identificationCode: string | null;
    address: string | null;
    bankName: string | null;
    iban: string | null;
    directorName?: string | null;
  };
  buyer: {
    name: string;
    legalName: string | null;
    identificationCode: string | null;
    address: string | null;
    directorName?: string | null;
  };
  currency: string;
  lines: {
    description: string;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    taxAmount: string;
    lineTotal: string;
  }[];
  subtotal: string;
  taxTotal: string;
  adjustment: string;
  total: string;
  issuedOn: string;
  taxMode: string;
  fiscalNote: string;
};

function requisitesReady(org: { identificationCode: string | null; iban: string | null; bankName: string | null }): string | null {
  if (!org.identificationCode) return "გატარებამდე შეავსეთ საიდენტიფიკაციო კოდი პარამეტრებში";
  if (!org.bankName || !org.iban) return "გატარებამდე შეავსეთ ბანკის რეკვიზიტები პარამეტრებში";
  return null;
}

export async function createInvoiceFromOrder(actor: Actor, orderId: string) {
  requirePermission(actor, "finance.write");
  const postingKey = `invoice:order:${orderId}`;
  try {
    return await withTx((tx) => createInvoiceFromOrderTx(tx, actor, orderId, postingKey));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().invoice.findUnique({ where: { postingKey } });
    if (!existing || existing.organizationId !== actor.organizationId) throw error;
    return existing;
  }
}

async function createInvoiceFromOrderTx(tx: Tx, actor: Actor, orderId: string, postingKey: string) {
  const existing = await tx.invoice.findUnique({ where: { postingKey } });
  if (existing) return existing;
  const order = await tx.salesOrder.findFirst({
    where: { id: orderId, organizationId: actor.organizationId },
    include: { lines: true, customer: { include: { addresses: true } } },
  });
  if (!order) throw new BusinessError("შეკვეთა ვერ მოიძებნა", "not_found");
  if (!["completed", "rs_error", "fulfilled"].includes(order.status)) {
    throw new BusinessError("ინვოისი იქმნება მიწოდებული შეკვეთიდან", "invalid_state");
  }
  return insertInvoice(tx, actor, {
    postingKey,
    customerId: order.customerId,
    orderId: order.id,
    sourceType: "sales_order",
    sourceId: order.id,
    currency: order.currency,
    lines: order.lines.map((line) => ({
      variantId: line.variantId,
      description: line.description,
      quantity: D(line.quantity),
      unitPrice: D(line.unitPrice),
      discountAmount: D(line.discountAmount),
      lineTotal: D(line.lineTotal),
    })),
    buyerAddress: order.customer.addresses[0]?.line1 ?? null,
  });
}

export async function createInvoiceFromRental(actor: Actor, bookingId: string) {
  requirePermission(actor, "finance.write");
  const postingKey = `invoice:rental:${bookingId}`;
  try {
    return await withTx((tx) => createInvoiceFromRentalTx(tx, actor, bookingId, postingKey));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().invoice.findUnique({ where: { postingKey } });
    if (!existing || existing.organizationId !== actor.organizationId) throw error;
    return existing;
  }
}

async function createInvoiceFromRentalTx(tx: Tx, actor: Actor, bookingId: string, postingKey: string) {
  const existing = await tx.invoice.findUnique({ where: { postingKey } });
  if (existing) return existing;
  const booking = await tx.rentalBooking.findFirst({
    where: { id: bookingId, organizationId: actor.organizationId },
    include: { lines: true, customer: { include: { addresses: true } } },
  });
  if (!booking) throw new BusinessError("ჯავშანი ვერ მოიძებნა", "not_found");
  const quantity = D(booking.lines.length);
  if (quantity.lte(0)) throw new BusinessError("ჯავშანზე მცენარე არ არის", "invalid_state");
  const priced = priceFromTarget(quantity, D(booking.total));
  return createManualInvoice(tx, actor, {
    postingKey,
    customerId: booking.customerId,
    sourceType: "rental",
    sourceId: booking.id,
    lines: [
      {
        description: "მცენარის გაქირავება",
        quantity,
        unitPrice: priced.unitPrice,
        lineTotal: priced.lineTotal,
      },
    ],
    adjustment: priced.adjustment,
    buyerAddress: booking.customer.addresses[0]?.line1 ?? null,
  });
}

export async function issueCreditNote(
  actor: Actor,
  input: { customerId: string; amount: string; description: string; postingKey: string },
) {
  requirePermission(actor, "finance.write");
  const amount = roundMoney(D(input.amount));
  if (amount.lte(0)) throw new BusinessError("კრედიტი ნულზე მეტი უნდა იყოს", "validation");
  try {
    return await withTx((tx) =>
      createManualInvoice(tx, actor, {
        postingKey: input.postingKey,
        customerId: input.customerId,
        sourceType: "credit_note",
        sourceId: input.postingKey,
        lines: [
          {
            description: input.description.trim() || "კრედიტი",
            quantity: D("1"),
            unitPrice: amount.neg(),
            lineTotal: amount.neg(),
          },
        ],
      }),
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().invoice.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

export async function grantCustomerCredit(
  actor: Actor,
  input: { customerId: string; amount: string; reason: string; postingKey: string },
) {
  requirePermission(actor, "finance.write");
  const amount = roundMoney(D(input.amount));
  if (amount.lte(0)) throw new BusinessError("კრედიტი ნულზე მეტი უნდა იყოს", "validation");
  try {
    return await withTx(async (tx) => {
      const existing = await tx.customerCredit.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, organizationId: actor.organizationId },
      });
      if (!customer) throw new BusinessError("კლიენტი ვერ მოიძებნა", "not_found");
      return tx.customerCredit.create({
        data: {
          organizationId: actor.organizationId,
          customerId: customer.id,
          amount: amount.toFixed(2),
          postingKey: input.postingKey,
          reason: input.reason.trim() || "კრედიტი",
        },
      });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await getDb().customerCredit.findUnique({ where: { postingKey: input.postingKey } });
    if (!existing) throw error;
    return existing;
  }
}

export async function createManualInvoice(
  tx: Tx,
  actor: Actor,
  input: {
    postingKey: string;
    customerId: string;
    sourceType: string;
    sourceId: string;
    currency?: string;
    lines: PricedLine[];
    adjustment?: Decimal;
    buyerAddress?: string | null;
    forceDraft?: boolean;
  },
) {
  const existing = await tx.invoice.findUnique({ where: { postingKey: input.postingKey } });
  if (existing) return existing;
  return insertInvoice(tx, actor, {
    postingKey: input.postingKey,
    customerId: input.customerId,
    orderId: null,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    currency: input.currency ?? "GEL",
    lines: input.lines,
    buyerAddress: input.buyerAddress ?? null,
    adjustment: input.adjustment,
    forceDraft: input.forceDraft,
  });
}

async function insertInvoice(
  tx: Tx,
  actor: Actor,
  input: {
    postingKey: string;
    customerId: string;
    orderId: string | null;
    sourceType: string;
    sourceId: string;
    currency: string;
    buyerAddress: string | null;
    adjustment?: Decimal;
    forceDraft?: boolean;
    lines: PricedLine[];
  },
) {
  const priced = await priceInvoice(tx, actor.organizationId, input);
  const blocker = input.forceDraft ? "ავტომატური გატარება გამორთულია" : requisitesReady(priced.organization);
  const { subtotal, tax, total, snapshot, issuedOn } = priced;
  const number = blocker ? null : await nextNumber(tx, actor.organizationId, "invoice", "INV");
  return tx.invoice.create({
    data: {
      organizationId: actor.organizationId,
      number,
      customerId: priced.customer.id,
      orderId: input.orderId,
      status: blocker ? "draft" : "posted",
      currency: input.currency,
      subtotal: subtotal.toFixed(2),
      taxTotal: tax.toFixed(2),
      total: total.toFixed(2),
      issuedOn: blocker ? null : parseDate(issuedOn),
      dueOn: blocker ? null : parseDate(issuedOn),
      postingKey: input.postingKey,
      ...(blocker ? {} : { snapshot }),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      draftReason: blocker,
      lines: {
        create: input.lines.map((line, index) => ({
          variantId: line.variantId,
          description: line.description,
          quantity: line.quantity.toFixed(3),
          unitPrice: line.unitPrice.toFixed(4),
          discountAmount: (line.discountAmount ?? D("0")).toFixed(2),
          lineTotal: line.lineTotal.toFixed(2),
          sort: index,
        })),
      },
    },
  });
}

type PricedLine = { description: string; quantity: Decimal; unitPrice: Decimal; discountAmount?: Decimal; lineTotal: Decimal; variantId?: string | null };

async function priceInvoice(
  tx: Tx,
  organizationId: string,
  input: { customerId: string; currency: string; buyerAddress: string | null; adjustment?: Decimal; lines: PricedLine[] },
) {
  const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const customer = await tx.customer.findFirstOrThrow({
    where: { id: input.customerId, organizationId },
    include: { addresses: true },
  });
  const adjustment = input.adjustment ?? D("0");
  const subtotal = roundMoney(input.lines.reduce((sum, line) => sum.plus(line.lineTotal), D("0")).plus(adjustment));
  const tax = organization.taxMode === "exclusive" ? roundMoney(subtotal.mul(D(organization.taxRate))) : D("0");
  const total = roundMoney(subtotal.plus(tax));
  const issuedOn = tbilisiDateString();
  const snapshot: InvoiceSnapshot = {
    seller: {
      name: organization.name,
      legalName: organization.legalName,
      identificationCode: organization.identificationCode,
      address: organization.address,
      bankName: organization.bankName,
      iban: organization.iban,
      directorName: organization.directorName,
    },
    buyer: {
      name: customer.name,
      legalName: customer.legalName,
      identificationCode: customer.identificationCode,
      address: composeBuyerAddress(input.buyerAddress ?? customer.addresses[0]?.line1 ?? null, customer.city),
      directorName: customer.directorName,
    },
    currency: input.currency,
    lines: input.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity.toFixed(3),
      unitPrice: line.unitPrice.toFixed(4),
      discountAmount: (line.discountAmount ?? D("0")).toFixed(2),
      taxAmount: "0.00",
      lineTotal: line.lineTotal.toFixed(2),
    })),
    subtotal: subtotal.toFixed(2),
    taxTotal: tax.toFixed(2),
    adjustment: adjustment.toFixed(2),
    total: total.toFixed(2),
    issuedOn,
    taxMode: organization.taxMode,
    fiscalNote: "ეს არ არის RS-ზე რეგისტრირებული საგადასახადო დოკუმენტი.",
  };
  return { organization, customer, subtotal, tax, total, snapshot, issuedOn };
}

async function loadDraft(tx: Tx, organizationId: string, invoiceId: string) {
  const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, organizationId }, include: { lines: { orderBy: { sort: "asc" } } } });
  if (!invoice) throw new BusinessError("ინვოისი ვერ მოიძებნა", "not_found");
  if (invoice.status !== "draft") throw new BusinessError("გატარებული ინვოისის შეცვლა აღარ შეიძლება", "invalid_state");
  return invoice;
}

export type InvoiceDraftLine = { variantId?: string; description?: string; quantity: string; unitPrice?: string; discountAmount?: string };

export async function updateDraftInvoice(
  actor: Actor,
  invoiceId: string,
  input: { customerId: string; dueOn?: string; lines: InvoiceDraftLine[] },
) {
  requirePermission(actor, "finance.write");
  if (input.lines.length === 0) throw new BusinessError("ინვოისს ერთი ხაზი მაინც სჭირდება", "validation");
  return withTx(async (tx) => {
    const invoice = await loadDraft(tx, actor.organizationId, invoiceId);
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, organizationId: actor.organizationId, mergedIntoId: null } });
    if (!customer) throw new BusinessError("კლიენტი ვერ მოიძებნა", "not_found");
    const lines = [];
    for (const line of input.lines) {
      const quantity = D(line.quantity || "0");
      if (quantity.lte(0)) throw new BusinessError("რაოდენობა ნულზე მეტი უნდა იყოს", "validation");
      if (!line.unitPrice?.trim()) throw new BusinessError("ხაზს ფასი სჭირდება", "validation");
      const unitPrice = D(line.unitPrice);
      const discount = D(line.discountAmount || "0");
      let variantId: string | null = null;
      let description = line.description?.trim() ?? "";
      if (line.variantId) {
        const variant = await tx.productVariant.findFirst({ where: { id: line.variantId, organizationId: actor.organizationId } });
        if (!variant) throw new BusinessError("ვარიანტი ვერ მოიძებნა", "not_found");
        variantId = variant.id;
        description ||= variant.nameKa;
      }
      if (!description) throw new BusinessError("ხაზს დასახელება სჭირდება", "validation");
      lines.push({ variantId, description, quantity, unitPrice, discountAmount: discount, lineTotal: roundMoney(quantity.mul(unitPrice).minus(discount)) });
    }
    const priced = await priceInvoice(tx, actor.organizationId, { customerId: customer.id, currency: invoice.currency, buyerAddress: null, lines });
    await tx.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        customerId: customer.id,
        subtotal: priced.subtotal.toFixed(2),
        taxTotal: priced.tax.toFixed(2),
        total: priced.total.toFixed(2),
        dueOn: input.dueOn?.trim() ? parseDate(input.dueOn.trim()) : null,
        lines: {
          create: lines.map((line, index) => ({
            variantId: line.variantId,
            description: line.description,
            quantity: line.quantity.toFixed(3),
            unitPrice: line.unitPrice.toFixed(4),
            discountAmount: line.discountAmount.toFixed(2),
            lineTotal: line.lineTotal.toFixed(2),
            sort: index,
          })),
        },
      },
    });
    await audit(tx, actor, "invoice.update", "invoice", invoice.id, undefined, { lines: lines.length, total: priced.total.toFixed(2) });
    return updated;
  });
}

export async function postDraftInvoice(actor: Actor, invoiceId: string) {
  requirePermission(actor, "finance.write");
  return withTx(async (tx) => {
    const invoice = await loadDraft(tx, actor.organizationId, invoiceId);
    if (invoice.lines.length === 0) throw new BusinessError("ინვოისს ერთი ხაზი მაინც სჭირდება", "validation");
    const lines = invoice.lines.map((line) => ({
      description: line.description,
      quantity: D(line.quantity),
      unitPrice: D(line.unitPrice),
      discountAmount: D(line.discountAmount),
      lineTotal: D(line.lineTotal),
    }));
    const lineSum = lines.reduce((sum, line) => sum.plus(line.lineTotal), D("0"));
    const adjustment = roundMoney(D(invoice.subtotal).minus(lineSum));
    const priced = await priceInvoice(tx, actor.organizationId, {
      customerId: invoice.customerId,
      currency: invoice.currency,
      buyerAddress: null,
      adjustment,
      lines,
    });
    const blocker = requisitesReady(priced.organization);
    if (blocker) throw new BusinessError(blocker, "invalid_state");
    const number = await nextNumber(tx, actor.organizationId, "invoice", "INV");
    const issued = parseDate(priced.issuedOn);
    const posted = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        number,
        status: "posted",
        subtotal: priced.subtotal.toFixed(2),
        taxTotal: priced.tax.toFixed(2),
        total: priced.total.toFixed(2),
        issuedOn: issued,
        dueOn: invoice.dueOn && invoice.dueOn >= issued ? invoice.dueOn : issued,
        snapshot: priced.snapshot,
        draftReason: null,
      },
    });
    await audit(tx, actor, "invoice.post", "invoice", invoice.id, undefined, { number, total: priced.total.toFixed(2) });
    return posted;
  });
}

function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export async function invoiceBalance(invoiceId: string): Promise<{ total: Decimal; allocated: Decimal; remaining: Decimal }> {
  const invoice = await getDb().invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { allocations: true },
  });
  const allocated = invoice.allocations.reduce((sum, row) => sum.plus(D(row.amount)), D("0"));
  const total = D(invoice.total);
  return { total, allocated, remaining: roundMoney(total.minus(allocated)) };
}

export function invoiceHtml(snapshot: InvoiceSnapshot, number: string): string {
  const issuedLong = safeGeorgianLongDate(snapshot.issuedOn);
  const issuedShort = safeGeorgianShortDate(snapshot.issuedOn);
  const currencyLabel = snapshot.currency === "GEL" ? "ლარი (GEL)" : snapshot.currency;
  const sellerName = snapshot.seller.legalName || snapshot.seller.name;
  const rows = snapshot.lines
    .map(
      (line) => `<tr>
        <td>${escapeHtml(line.description)}</td>
        <td class="num">${escapeHtml(quantityLabel(line.quantity))}</td>
        <td class="num">${escapeHtml(moneyPrint(line.lineTotal))} ${escapeHtml(snapshot.currency)}</td>
      </tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="ka">
<head>
  <meta charset="utf-8" />
  <style>
    @font-face {
      font-family: "Noto Sans Georgian";
      src: url("font.woff") format("woff");
    }
    * { box-sizing: border-box; }
    body { font-family: "Noto Sans Georgian", sans-serif; color: #1a2e24; margin: 28px 32px; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
    .logo { height: 56px; }
    h1 { font-size: 34px; margin: 0 0 4px; font-weight: 700; }
    .number { margin: 0 0 16px; color: #115e59; font-size: 15px; }
    .date { margin: 0 0 24px; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 20px; }
    .party h2 { font-size: 13px; margin: 0 0 8px; color: #115e59; font-weight: 700; }
    .party p { margin: 0 0 4px; font-size: 13px; }
    .party-name { font-weight: 700; }
    .currency { margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 8px; text-align: left; border-bottom: 1px solid #d6d3d1; vertical-align: top; }
    th { border-bottom: 2px solid #1a2e24; font-size: 13px; }
    .num { text-align: right; white-space: nowrap; }
    .total-row td { border-bottom: none; font-weight: 700; padding-top: 16px; }
    .sign { margin-top: 28px; font-size: 13px; }
    .bank { margin-top: 28px; }
    .bank h2 { font-size: 14px; margin: 0 0 8px; }
    .bank p { margin: 0 0 4px; font-size: 13px; }
    .note { margin-top: 32px; font-size: 11px; color: #57534e; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>ინვოისი</h1>
      <p class="number">${escapeHtml(number)}</p>
    </div>
    <img class="logo" src="logo.png" alt="Planter" />
  </div>
  <p class="date">თარიღი: ${escapeHtml(issuedLong)}</p>
  <div class="parties">
    ${partyHtml("მიმწოდებელი", snapshot.seller)}
    ${partyHtml("მომსახურების მიმღები", snapshot.buyer)}
  </div>
  <p class="currency">ვალუტა: ${escapeHtml(currencyLabel)}</p>
  <table>
    <thead>
      <tr>
        <th>მომსახურების დასახელება</th>
        <th class="num">რაოდენობა</th>
        <th class="num">თანხა</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="2">სულ გადასახდელი</td>
        <td class="num">${escapeHtml(moneyPrint(snapshot.total))} ${escapeHtml(snapshot.currency)}</td>
      </tr>
    </tbody>
  </table>
  <p class="sign">${escapeHtml(sellerName)} ${escapeHtml(issuedShort)}</p>
  <div class="bank">
    <h2>საბანკო რეკვიზიტები</h2>
    ${optionalLine("ბანკი", snapshot.seller.bankName)}
    ${optionalLine("მიმღები", sellerName)}
    ${optionalLine("ანგარიში", snapshot.seller.iban)}
  </div>
  <p class="note">${escapeHtml(snapshot.fiscalNote)}</p>
</body>
</html>`;
}

export async function renderInvoicePdf(actor: Actor, invoiceId: string): Promise<{ filename: string; bytes: Buffer; html: string }> {
  requirePermission(actor, "finance.read");
  const invoice = await getDb().invoice.findFirst({
    where: { id: invoiceId, organizationId: actor.organizationId },
  });
  if (!invoice) throw new BusinessError("ინვოისი ვერ მოიძებნა", "not_found");
  if (!invoice.snapshot || invoice.status !== "posted" || !invoice.number) {
    throw new BusinessError(invoice.draftReason || "ინვოისი ჯერ draft-ია", "invalid_state");
  }
  const snapshot = invoice.snapshot as InvoiceSnapshot;
  const html = invoiceHtml(snapshot, invoice.number);
  const bytes = await htmlToPdf(html);
  return { filename: `${invoice.number}.pdf`, bytes, html };
}

async function htmlToPdf(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const { readFile } = await import("fs/promises");
  const { join } = await import("path");
  let font = "";
  let logo = "";
  try {
    const file = await readFile(join(process.cwd(), "public", "fonts", "noto-sans-georgian-400.woff"));
    font = file.toString("base64");
  } catch {
    font = "";
  }
  try {
    const file = await readFile(join(process.cwd(), "public", "brand", "planter-logo.png"));
    logo = file.toString("base64");
  } catch {
    logo = "";
  }
  let withAssets = font ? html.replace('url("font.woff")', `url("data:font/woff;base64,${font}")`) : html;
  withAssets = logo
    ? withAssets.replace('src="logo.png"', `src="data:image/png;base64,${logo}"`)
    : withAssets.replace('<img class="logo" src="logo.png" alt="Planter" />', "");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(withAssets, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function composeBuyerAddress(line1: string | null, city: string | null): string | null {
  const parts = [line1, city].map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(", ") : null;
}

function quantityLabel(value: string): string {
  const amount = D(value);
  if (amount.equals(amount.trunc())) return amount.toFixed(0);
  return amount.toFixed(3).replace(/\.?0+$/, "");
}

function partyHtml(
  title: string,
  party: { name: string; legalName: string | null; identificationCode: string | null; address: string | null; directorName?: string | null },
): string {
  return `<div class="party">
    <h2>${escapeHtml(title)}</h2>
    <p class="party-name">${escapeHtml(party.legalName || party.name)}</p>
    ${optionalLine("ს/კ", party.identificationCode)}
    ${optionalLine("იურიდიული მისამართი", party.address)}
    ${optionalLine("დირექტორი", party.directorName)}
  </div>`;
}

function optionalLine(label: string, value: string | null | undefined): string {
  const text = value?.trim();
  if (!text) return "";
  return `<p>${escapeHtml(label)}: ${escapeHtml(text)}</p>`;
}

function safeGeorgianLongDate(iso: string): string {
  try {
    return formatGeorgianLongDate(iso);
  } catch {
    return iso;
  }
}

function safeGeorgianShortDate(iso: string): string {
  try {
    return formatGeorgianShortDate(iso);
  } catch {
    return iso;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function snapshotIssuedOn(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object" || !("issuedOn" in snapshot)) return null;
  return String((snapshot as { issuedOn: string }).issuedOn);
}

export function formatInvoiceDate(value: Date | null): string {
  return value ? formatDateOnly(value) : "—";
}

export function moneyLabel(value: { toString(): string }): string {
  return moneyText(D(value));
}
