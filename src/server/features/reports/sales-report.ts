import type { Prisma } from "@/generated/prisma/client";
import { canSeeSalesTotals, requirePermission, type Actor } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { salesDashboard } from "@/server/features/reports/dashboard-service";
import { agingReport } from "@/server/features/reports/ops-reports";
import { D, roundMoney } from "@/server/money";
import { parseDateOnly } from "@/server/time";
import { Groups, monthLabel, reportPeriod } from "@/server/features/reports/report-kit";

export type SalesReportFilters = { from?: string; to?: string; customerId?: string; ownerId?: string; source?: string };

export const INVOICE_SOURCE_LABEL: Record<string, string> = {
  order: "შეკვეთა",
  sales_order: "შეკვეთა",
  excursion: "ექსკურსია",
  rental: "გაქირავება",
  maintenance: "მოვლა",
  maintenance_contract: "მოვლა",
  credit_note: "კრედიტ-ნოტა",
  event: "ღონისძიება",
  greening: "გამწვანება",
  manual: "ხელით",
};

const sourceLabel = (code: string) => INVOICE_SOURCE_LABEL[code] ?? code;

export async function salesReport(actor: Actor, filters: SalesReportFilters) {
  requirePermission(actor, "reports.read");
  const showMoney = canSeeSalesTotals(actor);
  const period = reportPeriod(filters);
  const orgId = actor.organizationId;
  const db = getDb();
  const ownerId = filters.ownerId === "none" ? null : filters.ownerId || undefined;
  const where: Prisma.InvoiceWhereInput = {
    organizationId: orgId,
    status: { in: ["posted", "paid"] },
    issuedOn: { gte: parseDateOnly(period.from), lte: parseDateOnly(period.to) },
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(ownerId !== undefined ? { customer: { ownerId } } : {}),
    ...(filters.source ? { sourceType: filters.source } : {}),
  };
  const [invoices, members, customerOptions, sources] = await Promise.all([
    db.invoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, ownerId: true } },
        lines: { select: { variantId: true, description: true, quantity: true, lineTotal: true, taxAmount: true } },
        allocations: { select: { amount: true } },
      },
      orderBy: [{ issuedOn: "asc" }, { number: "asc" }],
    }),
    db.membership.findMany({ where: { organizationId: orgId }, select: { user: { select: { id: true, name: true } } } }),
    db.invoice.findMany({ where: { organizationId: orgId, status: { in: ["posted", "paid"] } }, distinct: ["customerId"], select: { customer: { select: { id: true, name: true } } } }),
    db.invoice.findMany({ where: { organizationId: orgId }, distinct: ["sourceType"], select: { sourceType: true } }),
  ]);
  const variantIds = [...new Set(invoices.flatMap((invoice) => invoice.lines.map((line) => line.variantId)).filter((id): id is string => Boolean(id)))];
  const variants = variantIds.length
    ? await db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, nameKa: true, internalCode: true, sku: true } })
    : [];
  const variantOf = new Map(variants.map((item) => [item.id, item]));
  const userName = new Map(members.map((member) => [member.user.id, member.user.name]));
  const ownerName = (id: string | null) => (id ? (userName.get(id) ?? "—") : "მენეჯერის გარეშე");

  const customers = new Groups();
  const products = new Groups();
  const owners = new Groups();
  const sourceGroups = new Groups();
  const months = new Groups();
  let net = D(0);
  let tax = D(0);
  let total = D(0);
  let paid = D(0);
  const rows = invoices.map((invoice) => {
    const lineNet = invoice.lines.reduce((sum, line) => sum.plus(line.lineTotal), D(0));
    const lineTax = invoice.lines.reduce((sum, line) => sum.plus(line.taxAmount), D(0));
    const allocated = invoice.allocations.reduce((sum, item) => sum.plus(item.amount), D(0));
    net = net.plus(lineNet);
    tax = tax.plus(lineTax);
    total = total.plus(invoice.total);
    paid = paid.plus(allocated);
    customers.add(invoice.customer.id, invoice.customer.name, { amount: lineNet });
    owners.add(invoice.customer.ownerId ?? "none", ownerName(invoice.customer.ownerId), { amount: lineNet });
    sourceGroups.add(invoice.sourceType, sourceLabel(invoice.sourceType), { amount: lineNet });
    const month = invoice.issuedOn!.toISOString().slice(0, 7);
    months.add(month, monthLabel(month), { amount: lineNet });
    for (const line of invoice.lines) {
      const variant = line.variantId ? variantOf.get(line.variantId) : null;
      const key = variant ? variant.id : `text:${line.description.trim().toLowerCase()}`;
      const label = variant ? `${variant.internalCode ?? variant.sku} · ${variant.nameKa}` : line.description.trim() || "—";
      products.add(key, label, { quantity: line.quantity, amount: line.lineTotal });
    }
    return {
      id: invoice.id,
      number: invoice.number,
      issuedOn: invoice.issuedOn!,
      customerId: invoice.customer.id,
      customer: invoice.customer.name,
      owner: ownerName(invoice.customer.ownerId),
      source: sourceLabel(invoice.sourceType),
      lines: invoice.lines.length,
      net: showMoney ? roundMoney(lineNet) : null,
      total: showMoney ? D(invoice.total) : null,
      remaining: showMoney ? roundMoney(D(invoice.total).minus(allocated)) : null,
    };
  });

  const dashboard = showMoney ? await salesDashboard(actor, period.from, period.to) : null;
  const aging = showMoney ? await agingReport(actor, period.to) : [];
  const moneyOrZero = <T extends { amount: unknown }>(items: T[]) => (showMoney ? items : items.map((item) => ({ ...item, amount: D(0) })));
  return {
    period,
    showMoney,
    totals: {
      invoices: invoices.length,
      customers: new Set(invoices.map((invoice) => invoice.customerId)).size,
      net: showMoney ? roundMoney(net) : null,
      tax: showMoney ? roundMoney(tax) : null,
      total: showMoney ? roundMoney(total) : null,
      paid: showMoney ? roundMoney(paid) : null,
      average: showMoney && invoices.length ? roundMoney(total.div(invoices.length)) : null,
      sold: dashboard ? D(dashboard.sold) : null,
      received: dashboard ? D(dashboard.received) : null,
      margin: dashboard ? D(dashboard.grossMargin) : null,
      overdue: showMoney ? roundMoney(aging.reduce((sum, row) => sum.plus(row.remaining), D(0))) : null,
    },
    breakdowns: {
      customers: moneyOrZero(customers.sorted(showMoney ? "amount" : "count")),
      products: moneyOrZero(products.sorted(showMoney ? "amount" : "quantity")),
      owners: moneyOrZero(owners.sorted(showMoney ? "amount" : "count")),
      sources: moneyOrZero(sourceGroups.sorted(showMoney ? "amount" : "count")),
      months: moneyOrZero(months.sorted("key")),
    },
    aging,
    rows,
    options: {
      customers: customerOptions.map((item) => ({ value: item.customer.id, label: item.customer.name })).sort((a, b) => a.label.localeCompare(b.label)),
      owners: members.map((item) => ({ value: item.user.id, label: item.user.name })).sort((a, b) => a.label.localeCompare(b.label)),
      sources: sources.map((item) => ({ value: item.sourceType, label: sourceLabel(item.sourceType) })),
    },
  };
}

export type SalesReport = Awaited<ReturnType<typeof salesReport>>;
