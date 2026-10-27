import type { Prisma } from "@/generated/prisma/client";
import { can, requirePermission, type Actor } from "@/server/auth/permissions";
import { contains, getDb } from "@/server/db";
import { MOVEMENT_TYPE_LABEL } from "@/server/features/inventory/movement-journal";
import { D, roundMoney } from "@/server/money";
import { Groups, reportPeriod } from "@/server/features/reports/report-kit";

export type StockReportFilters = { from?: string; to?: string; locationId?: string; category?: string; q?: string; only?: string };

export const CATEGORY_LABEL: Record<string, string> = {
  plant: "მცენარე",
  pot: "ქოთანი",
  soil: "მიწა/სუბსტრატი",
  service: "მომსახურება",
};

type Sum = { _sum: { quantity: { toString(): string } | null } };
const key = (variantId: string, locationId: string) => `${variantId}:${locationId}`;

function sums<T extends { variantId: string; locationId: string } & Sum>(rows: T[]) {
  return new Map(rows.map((row) => [key(row.variantId, row.locationId), D(row._sum.quantity ?? 0)]));
}

export async function stockReport(actor: Actor, filters: StockReportFilters) {
  requirePermission(actor, "reports.read");
  requirePermission(actor, "stock.read");
  const showCost = can(actor, "stock.cost.read");
  const period = reportPeriod(filters);
  const orgId = actor.organizationId;
  const db = getDb();
  const q = filters.q?.trim();
  const variantWhere: Prisma.ProductVariantWhereInput = {
    ...(filters.category ? { product: { category: filters.category } } : {}),
    ...(q ? { OR: [{ internalCode: contains(q) }, { sku: contains(q) }, { nameKa: contains(q) }, { barcode: contains(q) }] } : {}),
  };
  const scope = {
    organizationId: orgId,
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
    ...(filters.category || q ? { variant: variantWhere } : {}),
  };
  const inPeriod = { gte: period.start, lt: period.end };

  const [balances, after, incoming, outgoing, byType, locations] = await Promise.all([
    db.stockBalance.findMany({
      where: scope,
      include: {
        variant: { select: { id: true, sku: true, nameKa: true, internalCode: true, averageCost: true, product: { select: { category: true } } } },
        location: { select: { id: true, nameKa: true, code: true } },
      },
    }),
    db.stockMovement.groupBy({ by: ["variantId", "locationId"], where: { ...scope, occurredAt: { gte: period.end } }, _sum: { quantity: true } }),
    db.stockMovement.groupBy({ by: ["variantId", "locationId"], where: { ...scope, occurredAt: inPeriod, quantity: { gt: 0 } }, _sum: { quantity: true } }),
    db.stockMovement.groupBy({ by: ["variantId", "locationId"], where: { ...scope, occurredAt: inPeriod, quantity: { lt: 0 } }, _sum: { quantity: true } }),
    db.stockMovement.groupBy({ by: ["movementType"], where: { ...scope, occurredAt: inPeriod }, _sum: { quantity: true }, _count: { _all: true } }),
    db.location.findMany({ where: { organizationId: orgId }, select: { id: true, nameKa: true }, orderBy: { code: "asc" } }),
  ]);
  const afterMap = sums(after);
  const inMap = sums(incoming);
  const outMap = sums(outgoing);

  const byLocation = new Groups();
  const byCategory = new Groups();
  let closingQty = D(0);
  let openingQty = D(0);
  let inQty = D(0);
  let outQty = D(0);
  let value = D(0);
  let negative = 0;
  const rows = balances
    .map((balance) => {
      const id = key(balance.variantId, balance.locationId);
      const closing = D(balance.onHand).minus(afterMap.get(id) ?? 0);
      const inn = inMap.get(id) ?? D(0);
      const out = (outMap.get(id) ?? D(0)).abs();
      const opening = closing.minus(inn).plus(out);
      const averageCost = D(balance.variant.averageCost);
      const rowValue = roundMoney(closing.mul(averageCost));
      return {
        id: balance.id,
        variantId: balance.variantId,
        code: balance.variant.internalCode ?? balance.variant.sku,
        sku: balance.variant.sku,
        name: balance.variant.nameKa,
        category: CATEGORY_LABEL[balance.variant.product.category] ?? balance.variant.product.category,
        categoryCode: balance.variant.product.category,
        locationId: balance.location.id,
        location: balance.location.nameKa,
        opening,
        incoming: inn,
        outgoing: out,
        closing,
        reserved: D(balance.reserved),
        averageCost: showCost ? averageCost : null,
        value: showCost ? rowValue : null,
      };
    })
    .filter((row) => !(row.opening.isZero() && row.incoming.isZero() && row.outgoing.isZero() && row.closing.isZero()))
    .filter((row) => (filters.only === "moved" ? !(row.incoming.isZero() && row.outgoing.isZero()) : filters.only === "stock" ? row.closing.gt(0) : true))
    .sort((a, b) => a.name.localeCompare(b.name) || a.location.localeCompare(b.location));

  for (const row of rows) {
    closingQty = closingQty.plus(row.closing);
    openingQty = openingQty.plus(row.opening);
    inQty = inQty.plus(row.incoming);
    outQty = outQty.plus(row.outgoing);
    if (row.closing.lt(0)) negative += 1;
    const amount = row.value ?? D(0);
    value = value.plus(amount);
    byLocation.add(row.locationId, row.location, { quantity: row.closing, amount });
    byCategory.add(row.categoryCode, row.category, { quantity: row.closing, amount });
  }

  return {
    period,
    showCost,
    totals: {
      items: new Set(rows.filter((row) => row.closing.gt(0)).map((row) => row.variantId)).size,
      rows: rows.length,
      opening: openingQty,
      incoming: inQty,
      outgoing: outQty,
      closing: closingQty,
      value: showCost ? roundMoney(value) : null,
      negative,
    },
    breakdowns: {
      locations: byLocation.sorted(showCost ? "amount" : "quantity"),
      categories: byCategory.sorted(showCost ? "amount" : "quantity"),
      types: byType
        .map((row) => ({
          key: row.movementType,
          label: MOVEMENT_TYPE_LABEL[row.movementType] ?? row.movementType,
          count: row._count._all,
          quantity: D(row._sum.quantity ?? 0),
        }))
        .sort((a, b) => b.quantity.abs().comparedTo(a.quantity.abs())),
    },
    rows,
    options: {
      locations: locations.map((item) => ({ value: item.id, label: item.nameKa })),
      categories: Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label })),
    },
  };
}

export type StockReport = Awaited<ReturnType<typeof stockReport>>;
