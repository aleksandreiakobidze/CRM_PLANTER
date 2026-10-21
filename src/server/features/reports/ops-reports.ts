import type { Actor } from "@/server/auth/permissions";
import { can, canSeeSalesTotals, requirePermission } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { D, Decimal, roundMoney } from "@/server/money";
import { invoiceBalance } from "@/server/features/finance/invoice-service";
import { salesDashboard } from "@/server/features/reports/dashboard-service";
import { campaignRoas } from "@/server/features/marketing/marketing-service";
import { formatDateOnly, parseDateOnly, tbilisiDateString } from "@/server/time";

export type AgingBucket = { invoiceId: string; number: string | null; customer: string; remaining: string; days: number; bucket: string };

export async function agingReport(actor: Actor, asOf = tbilisiDateString()): Promise<AgingBucket[]> {
  requirePermission(actor, "reports.sales.read");
  const invoices = await getDb().invoice.findMany({
    where: { organizationId: actor.organizationId, status: "posted" },
    include: { customer: true },
    orderBy: { issuedOn: "asc" },
  });
  const asOfDate = parseDateOnly(asOf);
  const rows: AgingBucket[] = [];
  for (const invoice of invoices) {
    const balance = await invoiceBalance(invoice.id);
    if (balance.remaining.lte(0)) continue;
    const start = invoice.dueOn ?? invoice.issuedOn;
    const days = start ? Math.max(0, Math.floor((asOfDate.getTime() - start.getTime()) / 86_400_000)) : 0;
    const bucket = days <= 30 ? "0–30" : days <= 60 ? "31–60" : days <= 90 ? "61–90" : "90+";
    rows.push({
      invoiceId: invoice.id,
      number: invoice.number,
      customer: invoice.customer.name,
      remaining: balance.remaining.toFixed(2),
      days,
      bucket,
    });
  }
  return rows;
}

export async function openPurchaseOrders(actor: Actor) {
  requirePermission(actor, "reports.read");
  return getDb().purchaseOrder.findMany({
    where: { organizationId: actor.organizationId, status: { in: ["ordered", "partial"] } },
    include: { supplier: true, lines: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function greenhouseBatches(actor: Actor) {
  requirePermission(actor, "reports.read");
  return getDb().growthBatch.findMany({
    where: { organizationId: actor.organizationId, status: "open" },
    include: { variant: true, location: true, supplier: true },
    orderBy: { expectedReadyOn: "asc" },
  });
}

export async function deliveryDayReport(actor: Actor, date = tbilisiDateString()) {
  requirePermission(actor, "reports.read");
  return getDb().route.findMany({
    where: { organizationId: actor.organizationId, date: parseDateOnly(date) },
    include: { stops: { include: { task: true }, orderBy: { sort: "asc" } } },
  });
}

export async function campaignSummaries(actor: Actor) {
  requirePermission(actor, "reports.read");
  const campaigns = await getDb().campaign.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: { startOn: "desc" },
  });
  return campaigns.map((campaign) => {
    const spend = campaign.spendAmount == null ? null : D(campaign.spendAmount);
    const revenue = campaign.attributedRevenue == null ? null : D(campaign.attributedRevenue);
    return {
      id: campaign.id,
      name: campaign.name,
      goal: campaign.goal,
      startOn: formatDateOnly(campaign.startOn),
      endOn: formatDateOnly(campaign.endOn),
      budget: campaign.budgetAmount.toString(),
      spend: spend ? spend.toFixed(2) : null,
      attributedRevenue: revenue ? revenue.toFixed(2) : null,
      roas: campaignRoas(spend, revenue),
    };
  });
}

export async function opsDashboard(actor: Actor, fromIso: string, toIso: string) {
  requirePermission(actor, "reports.read");
  const showSales = canSeeSalesTotals(actor);
  const sales = showSales ? await salesDashboard(actor, fromIso, toIso) : null;
  const aging = showSales ? await agingReport(actor, toIso) : [];
  const openPo = await openPurchaseOrders(actor);
  const batches = await greenhouseBatches(actor);
  const delivery = can(actor, "delivery.read") ? await deliveryDayReport(actor, toIso) : [];
  const overdue = roundMoney(aging.reduce((sum, row) => sum.plus(D(row.remaining)), new Decimal(0)));
  return {
    showSales,
    sales,
    overdue: overdue.toFixed(2),
    aging,
    openPoCount: openPo.length,
    batchCount: batches.length,
    deliveryStopCount: delivery.reduce((sum, route) => sum + route.stops.length, 0),
    integration: "მონაცემი არ არის",
  };
}
