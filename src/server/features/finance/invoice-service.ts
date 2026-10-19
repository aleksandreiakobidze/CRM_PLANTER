import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { getDb, type Tx } from "@/server/db";
import { BusinessError, isUniqueViolation } from "@/server/errors";
import { D, Decimal, moneyText, roundMoney } from "@/server/money";
import { nextNumber } from "@/server/numbers";
import { formatDateOnly, tbilisiDateString } from "@/server/time";
import { withTx } from "@/server/tx";

export type InvoiceSnapshot = {
  seller: {
    name: string;
    legalName: string | null;
    identificationCode: string | null;
    address: string | null;
    bankName: string | null;
    iban: string | null;
  };
  buyer: {
    name: string;
    legalName: string | null;
    identificationCode: string | null;
    address: string | null;
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
  if (order.status !== "fulfilled") throw new BusinessError("ინვოისი იქმნება მიწოდებული შეკვეთიდან", "invalid_state");
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

export async function createManualInvoice(
  tx: Tx,
  actor: Actor,
  input: {
    postingKey: string;
    customerId: string;
    sourceType: string;
    sourceId: string;
    currency?: string;
    lines: { description: string; quantity: Decimal; unitPrice: Decimal; discountAmount?: Decimal; lineTotal: Decimal; variantId?: string }[];
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
    lines: { description: string; quantity: Decimal; unitPrice: Decimal; discountAmount?: Decimal; lineTotal: Decimal; variantId?: string }[];
  },
) {
  const organization = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
  const customer = await tx.customer.findFirstOrThrow({
    where: { id: input.customerId, organizationId: actor.organizationId },
    include: { addresses: true },
  });
  const adjustment = input.adjustment ?? D("0");
  const subtotal = roundMoney(input.lines.reduce((sum, line) => sum.plus(line.lineTotal), D("0")).plus(adjustment));
  const tax = organization.taxMode === "exclusive" ? roundMoney(subtotal.mul(D(organization.taxRate))) : D("0");
  const total = roundMoney(subtotal.plus(tax));
  const blocker = input.forceDraft ? "ავტომატური გატარება გამორთულია" : requisitesReady(organization);
  const issuedOn = tbilisiDateString();
  const snapshot: InvoiceSnapshot = {
    seller: {
      name: organization.name,
      legalName: organization.legalName,
      identificationCode: organization.identificationCode,
      address: organization.address,
      bankName: organization.bankName,
      iban: organization.iban,
    },
    buyer: {
      name: customer.name,
      legalName: customer.legalName,
      identificationCode: customer.identificationCode,
      address: input.buyerAddress ?? customer.addresses[0]?.line1 ?? null,
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
  const number = blocker ? null : await nextNumber(tx, actor.organizationId, "invoice", "INV");
  return tx.invoice.create({
    data: {
      organizationId: actor.organizationId,
      number,
      customerId: customer.id,
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
  const rows = snapshot.lines
    .map(
      (line) => `<tr>
        <td>${escapeHtml(line.description)}</td>
        <td class="num">${escapeHtml(line.quantity)}</td>
        <td class="num">${escapeHtml(line.unitPrice)}</td>
        <td class="num">${escapeHtml(line.lineTotal)}</td>
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
    body { font-family: "Noto Sans Georgian", sans-serif; color: #14231b; margin: 32px; }
    h1 { color: #14532d; font-size: 28px; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { border-bottom: 1px solid #d9e2dc; padding: 8px; text-align: left; }
    .num { text-align: right; }
    .total { font-size: 18px; font-weight: 700; }
    .note { margin-top: 24px; color: #3f5d4b; }
  </style>
</head>
<body>
  <h1>ინვოისი ${escapeHtml(number)}</h1>
  <p>${escapeHtml(snapshot.seller.name)}</p>
  <p>საიდენტიფიკაციო კოდი: ${escapeHtml(snapshot.seller.identificationCode ?? "—")}</p>
  <p>ბანკი: ${escapeHtml(snapshot.seller.bankName ?? "—")} ${escapeHtml(snapshot.seller.iban ?? "")}</p>
  <p>მყიდველი: ${escapeHtml(snapshot.buyer.name)}</p>
  <p>მისამართი: ${escapeHtml(snapshot.buyer.address ?? "—")}</p>
  <p>თარიღი: ${escapeHtml(snapshot.issuedOn)} · ვალუტა: ${escapeHtml(snapshot.currency)}</p>
  <table>
    <thead><tr><th>დასახელება</th><th class="num">რაოდენობა</th><th class="num">ფასი</th><th class="num">ჯამი</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="total">ჯამი: ${escapeHtml(snapshot.total)} ${escapeHtml(snapshot.currency)}</p>
  <p>დამრგვალების კორექტირება: ${escapeHtml(snapshot.adjustment)}</p>
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
  try {
    const file = await readFile(join(process.cwd(), "public", "fonts", "noto-sans-georgian-400.woff"));
    font = file.toString("base64");
  } catch {
    font = "";
  }
  const withFont = font
    ? html.replace('url("font.woff")', `url("data:font/woff;base64,${font}")`)
    : html;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(withFont, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
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
