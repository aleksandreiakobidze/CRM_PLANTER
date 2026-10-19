import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { D, Decimal, roundMoney } from "@/server/money";
import { formatDateOnly, parseDateOnly } from "@/server/time";

export async function salesDashboard(actor: Actor, fromIso: string, toIso: string) {
  requirePermission(actor, "reports.read");
  const from = parseDateOnly(fromIso);
  const to = parseDateOnly(toIso);
  const fulfillments = await getDb().fulfillment.findMany({
    where: { organizationId: actor.organizationId, fulfilledAt: { gte: from, lt: new Date(to.getTime() + 86_400_000) } },
    include: { lines: true },
  });
  const sold = roundMoney(fulfillments.reduce((sum, row) => sum.plus(row.lines.reduce((inner, line) => inner.plus(lineValue(line.quantity, line.unitCost)), new Decimal(0))), new Decimal(0)));
  const orderIds = fulfillments.map((row) => row.orderId);
  const orders = await getDb().salesOrder.findMany({ where: { id: { in: orderIds } }, include: { lines: true } });
  const soldRevenue = roundMoney(
    orders.reduce((sum, order) => sum.plus(order.lines.reduce((inner, line) => inner.plus(D(line.lineTotal)), new Decimal(0))), new Decimal(0)),
  );
  const invoices = await getDb().invoice.findMany({
    where: { organizationId: actor.organizationId, status: "posted", issuedOn: { gte: from, lte: to } },
  });
  const invoiced = roundMoney(invoices.reduce((sum, row) => sum.plus(D(row.total)), new Decimal(0)));
  const payments = await getDb().payment.findMany({
    where: { organizationId: actor.organizationId, kind: "payment", paidOn: { gte: from, lte: to } },
  });
  const received = roundMoney(payments.reduce((sum, row) => sum.plus(D(row.amount)), new Decimal(0)));
  const cogs = sold;
  return {
    from: fromIso,
    to: toIso,
    sold: soldRevenue.toFixed(2),
    invoiced: invoiced.toFixed(2),
    received: received.toFixed(2),
    cogs: cogs.toFixed(2),
    grossMargin: roundMoney(soldRevenue.minus(cogs)).toFixed(2),
    invoiceIds: invoices.map((row) => row.id),
    paymentIds: payments.map((row) => row.id),
    orderIds,
    basis: {
      sold: "მიწოდებული შეკვეთის ხაზის ჯამი",
      invoiced: "posted ინვოისის ჯამი issuedOn-ით",
      received: "payment გადახდები paidOn-ით, დეპოზიტის გარეშე",
    },
  };
}

function lineValue(quantity: { toString(): string }, unitCost: { toString(): string }): Decimal {
  return D(quantity).mul(D(unitCost));
}

export function dashboardPeriodLabel(from: Date, to: Date): string {
  return `${formatDateOnly(from)} — ${formatDateOnly(to)}`;
}

export async function maintenanceMrr(actor: Actor): Promise<string> {
  requirePermission(actor, "reports.read");
  const { activeMaintenanceFees } = await import("@/server/features/maintenance/maintenance-service");
  return activeMaintenanceFees(actor.organizationId);
}
