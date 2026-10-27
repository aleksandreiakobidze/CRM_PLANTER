import { can, canSeeSalesTotals, requirePermission, type Actor } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { maintenanceQuote } from "@/server/features/maintenance/maintenance-service";
import { D, roundMoney } from "@/server/money";
import { formatDateOnly, inclusiveDays, parseDateOnly } from "@/server/time";
import { Groups, monthLabel, percent, reportPeriod } from "@/server/features/reports/report-kit";

export type RentalReportFilters = { from?: string; to?: string; customerId?: string; status?: string };

export const RENTAL_STATUS_LABEL: Record<string, string> = {
  draft: "დრაფტი",
  confirmed: "დადასტურებული",
  out: "გატანილი",
  partially_returned: "ნაწილობრივ დაბრუნებული",
  returned: "დაბრუნებული",
  cancelled: "გაუქმებული",
};

export const ASSET_STATUS_LABEL: Record<string, string> = {
  available: "თავისუფალი",
  reserved: "დაჯავშნილი",
  on_rent: "გაქირავებული",
  out: "გატანილი",
  damaged: "დაზიანებული",
  lost: "დაკარგული",
};

const CONTRACT_STATUS_LABEL: Record<string, string> = { draft: "დრაფტი", active: "აქტიური", paused: "შეჩერებული", ended: "დასრულებული" };

function overlapDays(startOn: Date, endOn: Date, from: string, to: string) {
  const start = formatDateOnly(startOn) > from ? formatDateOnly(startOn) : from;
  const end = formatDateOnly(endOn) < to ? formatDateOnly(endOn) : to;
  return end < start ? 0 : inclusiveDays(start, end);
}

export async function rentalReport(actor: Actor, filters: RentalReportFilters) {
  requirePermission(actor, "reports.read");
  const showMoney = canSeeSalesTotals(actor);
  const period = reportPeriod(filters);
  const orgId = actor.organizationId;
  const db = getDb();
  const from = parseDateOnly(period.from);
  const to = parseDateOnly(period.to);
  const days = inclusiveDays(period.from, period.to);
  const status = filters.status && RENTAL_STATUS_LABEL[filters.status] ? filters.status : undefined;

  const [bookings, assets, contracts, replacements, customerOptions] = await Promise.all([
    db.rentalBooking.findMany({
      where: {
        organizationId: orgId,
        startOn: { lte: to },
        endOn: { gte: from },
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        lines: { select: { assetId: true, lineTotal: true } },
      },
      orderBy: [{ startOn: "asc" }, { number: "asc" }],
    }),
    db.rentalAsset.findMany({
      where: { organizationId: orgId },
      include: { variant: { select: { nameKa: true } }, location: { select: { nameKa: true } } },
      orderBy: { code: "asc" },
    }),
    db.maintenanceContract.findMany({
      where: {
        organizationId: orgId,
        startOn: { lte: to },
        OR: [{ endOn: null }, { endOn: { gte: from } }],
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
      },
      include: { customer: { select: { id: true, name: true } }, lines: true },
      orderBy: { number: "asc" },
    }),
    db.stockMovement.findMany({
      where: { organizationId: orgId, movementType: "replacement_issue", occurredAt: { gte: period.start, lt: period.end } },
      select: { quantity: true, unitCost: true },
    }),
    db.customer.findMany({
      where: { organizationId: orgId, OR: [{ bookings: { some: {} } }, { contracts: { some: {} } }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const usage = new Map<string, { days: number; revenue: ReturnType<typeof D>; bookings: number }>();
  const customers = new Groups();
  const months = new Groups();
  const statuses = new Groups();
  let revenue = D(0);
  let deposits = D(0);
  let active = 0;
  const rows = bookings.map((booking) => {
    const cancelled = booking.status === "cancelled" || booking.status === "draft";
    const overlap = overlapDays(booking.startOn, booking.endOn, period.from, period.to);
    statuses.add(booking.status, RENTAL_STATUS_LABEL[booking.status] ?? booking.status);
    if (!cancelled) {
      active += 1;
      const share = booking.billingDays > 0 ? D(overlap).div(booking.billingDays) : D(1);
      const periodRevenue = roundMoney(D(booking.total).mul(share.gt(1) ? 1 : share));
      revenue = revenue.plus(periodRevenue);
      deposits = deposits.plus(booking.depositAmount);
      customers.add(booking.customer.id, booking.customer.name, { quantity: booking.lines.length, amount: periodRevenue });
      const month = formatDateOnly(booking.startOn).slice(0, 7);
      months.add(month, monthLabel(month), { quantity: booking.lines.length, amount: periodRevenue });
      for (const line of booking.lines) {
        const item = usage.get(line.assetId) ?? { days: 0, revenue: D(0), bookings: 0 };
        item.days += overlap;
        item.bookings += 1;
        item.revenue = item.revenue.plus(booking.lines.length ? periodRevenue.div(booking.lines.length) : 0);
        usage.set(line.assetId, item);
      }
    }
    return {
      id: booking.id,
      number: booking.number,
      customerId: booking.customer.id,
      customer: booking.customer.name,
      startOn: booking.startOn,
      endOn: booking.endOn,
      billingDays: booking.billingDays,
      overlap,
      assets: booking.lines.length,
      status: booking.status,
      statusLabel: RENTAL_STATUS_LABEL[booking.status] ?? booking.status,
      total: showMoney ? D(booking.total) : null,
      deposit: showMoney ? D(booking.depositAmount) : null,
    };
  });

  const assetRows = assets
    .map((asset) => {
      const item = usage.get(asset.id) ?? { days: 0, revenue: D(0), bookings: 0 };
      return {
        id: asset.id,
        code: asset.internalCode ?? asset.code,
        name: asset.variant.nameKa,
        location: asset.location.nameKa,
        status: ASSET_STATUS_LABEL[asset.status] ?? asset.status,
        bookings: item.bookings,
        days: Math.min(item.days, days),
        utilisation: percent(Math.min(item.days, days), days) ?? 0,
        revenue: showMoney ? roundMoney(item.revenue) : null,
      };
    })
    .sort((a, b) => b.utilisation - a.utilisation || a.code.localeCompare(b.code));
  const assetStatus = new Groups();
  for (const asset of assets) assetStatus.add(asset.status, ASSET_STATUS_LABEL[asset.status] ?? asset.status);
  const occupiedDays = assetRows.reduce((sum, row) => sum + row.days, 0);

  const contractRows = contracts.map((contract) => {
    const quote = maintenanceQuote(
      contract.lines.map((line) => ({ quantity: D(line.quantity), referenceUnitPrice: D(line.referenceUnitPrice), active: line.active })),
      D(contract.percent),
    );
    return {
      id: contract.id,
      number: contract.number,
      customerId: contract.customer.id,
      customer: contract.customer.name,
      status: contract.status,
      statusLabel: CONTRACT_STATUS_LABEL[contract.status] ?? contract.status,
      startOn: contract.startOn,
      endOn: contract.endOn,
      plants: contract.lines.filter((line) => line.active).reduce((sum, line) => sum.plus(line.quantity), D(0)),
      percent: D(contract.percent),
      base: showMoney ? quote.base : null,
      fee: showMoney ? quote.fee : null,
    };
  });
  const activeContracts = contractRows.filter((row) => row.status === "active");
  const mrr = activeContracts.reduce((sum, row) => sum.plus(row.fee ?? 0), D(0));
  const showCost = can(actor, "stock.cost.read");
  const replacementQty = replacements.reduce((sum, row) => sum.plus(D(row.quantity).abs()), D(0));
  const replacementCost = replacements.reduce((sum, row) => sum.plus(D(row.quantity).abs().mul(row.unitCost)), D(0));

  return {
    period,
    showMoney,
    totals: {
      bookings: bookings.length,
      active,
      revenue: showMoney ? roundMoney(revenue) : null,
      deposits: showMoney ? roundMoney(deposits) : null,
      assets: assets.length,
      utilisation: percent(occupiedDays, assets.length * days),
      idle: assetRows.filter((row) => row.days === 0).length,
      contracts: activeContracts.length,
      mrr: showMoney ? roundMoney(mrr) : null,
      replacements: replacementQty,
      replacementCost: showCost ? roundMoney(replacementCost) : null,
    },
    breakdowns: {
      customers: customers.sorted(showMoney ? "amount" : "count"),
      months: months.sorted("key"),
      statuses: statuses.sorted("count"),
      assetStatus: assetStatus.sorted("count"),
    },
    rows,
    assets: assetRows,
    contracts: contractRows,
    options: { customers: customerOptions.map((item) => ({ value: item.id, label: item.name })) },
  };
}

export type RentalReport = Awaited<ReturnType<typeof rentalReport>>;
