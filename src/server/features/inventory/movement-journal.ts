import type { Prisma } from "@/generated/prisma/client";
import { can, requirePermission, type Actor } from "@/server/auth/permissions";
import { contains, getDb } from "@/server/db";
import { D } from "@/server/money";
import { parseDateOnly, zonedDateTime, addDaysIso } from "@/server/time";

export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  opening: "საწყისი ნაშთი",
  transfer_in: "გადატანა — შემოსვლა",
  transfer_out: "გადატანა — გასვლა",
  stock_in: "შესყიდვის მიღება",
  purchase_return: "მიმწოდებელთან დაბრუნება",
  purchase_return_marker: "დაბრუნების ნიშნული",
  sale_issue: "გაყიდვა",
  return_in: "კლიენტის დაბრუნება",
  excursion_consume: "ექსკურსიის ხარჯი",
  repot_out: "გადარგვა — გასვლა",
  repot_in: "გადარგვა — შემოსვლა",
  repot_material: "გადარგვის მასალა",
  count_adjust: "ინვენტარიზაცია",
  replacement_issue: "მოვლის შეცვლა",
};

export const MOVEMENT_GROUPS: { code: string; label: string; types: string[] }[] = [
  { code: "opening", label: "საწყისი ნაშთი", types: ["opening"] },
  { code: "transfer", label: "გადატანა", types: ["transfer_in", "transfer_out"] },
  { code: "purchase", label: "შესყიდვა", types: ["stock_in", "purchase_return", "purchase_return_marker"] },
  { code: "sale", label: "გაყიდვა", types: ["sale_issue", "return_in"] },
  { code: "greenhouse", label: "სათბური", types: ["repot_out", "repot_in", "repot_material"] },
  { code: "count", label: "ინვენტარიზაცია", types: ["count_adjust"] },
  { code: "service", label: "სერვისი", types: ["excursion_consume", "replacement_issue"] },
];

export const MOVEMENT_PAGE_SIZE = 50;

export type MovementFilters = {
  from?: string;
  to?: string;
  locationId?: string;
  q?: string;
  type?: string;
  source?: string;
  page?: number;
};

function validIso(value?: string) {
  if (!value) return null;
  try {
    parseDateOnly(value);
    return value;
  } catch {
    return null;
  }
}

export function movementWhere(organizationId: string, filters: MovementFilters): Prisma.StockMovementWhereInput {
  const from = validIso(filters.from);
  const to = validIso(filters.to);
  const group = MOVEMENT_GROUPS.find((item) => item.code === filters.type);
  const q = filters.q?.trim();
  return {
    organizationId,
    ...(filters.source ? { sourceId: filters.source } : {}),
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
    ...(group ? { movementType: { in: group.types } } : {}),
    ...(from || to
      ? {
          occurredAt: {
            ...(from ? { gte: zonedDateTime(from, "00:00") } : {}),
            ...(to ? { lt: zonedDateTime(addDaysIso(to, 1), "00:00") } : {}),
          },
        }
      : {}),
    ...(q
      ? { variant: { OR: [{ internalCode: contains(q) }, { sku: contains(q) }, { nameKa: contains(q) }, { barcode: contains(q) }] } }
      : {}),
  };
}

type SourceLink = { label: string; href: string | null };

async function sourceLinks(organizationId: string, rows: { sourceType: string; sourceId: string }[]) {
  const ids = (type: string) => [...new Set(rows.filter((row) => row.sourceType === type).map((row) => row.sourceId))];
  const db = getDb();
  const [receipts, fulfillments, returns, shipments, counts, rentals, excursions, projects] = await Promise.all([
    ids("goods_receipt").length
      ? db.goodsReceipt.findMany({ where: { organizationId, id: { in: ids("goods_receipt") } }, select: { id: true, number: true, purchaseOrderId: true } })
      : [],
    ids("fulfillment").length
      ? db.fulfillment.findMany({ where: { organizationId, id: { in: ids("fulfillment") } }, select: { id: true, number: true, orderId: true } })
      : [],
    ids("sales_return").length
      ? db.salesReturn.findMany({ where: { organizationId, id: { in: ids("sales_return") } }, select: { id: true, number: true, orderId: true } })
      : [],
    ids("internal_shipment").length
      ? db.internalShipment.findMany({ where: { organizationId, id: { in: ids("internal_shipment") } }, select: { id: true, number: true } })
      : [],
    ids("inventory_count").length
      ? db.inventoryCount.findMany({ where: { organizationId, id: { in: ids("inventory_count") } }, select: { id: true } })
      : [],
    [...ids("rental_delivery"), ...ids("rental_return")].length
      ? db.rentalBooking.findMany({ where: { organizationId, id: { in: [...ids("rental_delivery"), ...ids("rental_return")] } }, select: { id: true, number: true } })
      : [],
    ids("excursion").length ? db.excursionBooking.findMany({ where: { organizationId, id: { in: ids("excursion") } }, select: { id: true } }) : [],
    ids("greening").length ? db.greeningProject.findMany({ where: { organizationId, id: { in: ids("greening") } }, select: { id: true } }) : [],
  ]);
  const map = new Map<string, SourceLink>();
  for (const row of receipts) map.set(`goods_receipt:${row.id}`, { label: `მიღება ${row.number}`, href: `/purchases/${row.purchaseOrderId}` });
  for (const row of fulfillments) map.set(`fulfillment:${row.id}`, { label: `გაცემა ${row.number}`, href: `/sales/orders/${row.orderId}` });
  for (const row of returns) map.set(`sales_return:${row.id}`, { label: `დაბრუნება ${row.number}`, href: `/sales/orders/${row.orderId}?tab=return` });
  for (const row of shipments) map.set(`internal_shipment:${row.id}`, { label: `ზედნადები ${row.number ?? ""}`.trim(), href: `/inventory/waybill/${row.id}` });
  for (const row of counts) map.set(`inventory_count:${row.id}`, { label: "ინვენტარიზაცია", href: `/inventory/count/${row.id}` });
  for (const row of rentals) {
    map.set(`rental_delivery:${row.id}`, { label: `გაქირავება ${row.number}`, href: `/rental/${row.id}` });
    map.set(`rental_return:${row.id}`, { label: `დაბრუნება ${row.number}`, href: `/rental/${row.id}` });
  }
  for (const row of excursions) map.set(`excursion:${row.id}`, { label: "ექსკურსია", href: `/excursions/${row.id}` });
  for (const row of projects) map.set(`greening:${row.id}`, { label: "გამწვანება", href: `/projects/${row.id}` });
  return (sourceType: string, sourceId: string): SourceLink => {
    const found = map.get(`${sourceType}:${sourceId}`);
    if (found) return found;
    if (sourceType === "opening") return { label: "საწყისი ნაშთი", href: `/inventory/movements?source=${encodeURIComponent(sourceId)}` };
    if (sourceType === "transfer") return { label: "გადატანა", href: `/inventory/movements?source=${encodeURIComponent(sourceId)}` };
    if (sourceType === "repot") return { label: "გადარგვა", href: `/inventory/movements?source=${encodeURIComponent(sourceId)}` };
    return { label: sourceType, href: null };
  };
}

export async function listMovements(actor: Actor, filters: MovementFilters, options: { all?: boolean } = {}) {
  requirePermission(actor, "stock.read");
  const showCost = can(actor, "stock.cost.read");
  const where = movementWhere(actor.organizationId, filters);
  const page = Math.max(1, filters.page ?? 1);
  const db = getDb();
  const [rows, total, sums] = await Promise.all([
    db.stockMovement.findMany({
      where,
      include: { variant: { select: { internalCode: true, sku: true, nameKa: true } } },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: options.all ? 0 : (page - 1) * MOVEMENT_PAGE_SIZE,
      take: options.all ? 20000 : MOVEMENT_PAGE_SIZE,
    }),
    db.stockMovement.count({ where }),
    db.stockMovement.findMany({ where, select: { quantity: true, unitCost: true } }),
  ]);
  const locationIds = [...new Set(rows.map((row) => row.locationId))];
  const actorIds = [...new Set(rows.map((row) => row.actorId).filter((value): value is string => Boolean(value)))];
  const [locations, users, link] = await Promise.all([
    locationIds.length ? db.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, nameKa: true } }) : [],
    actorIds.length ? db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [],
    sourceLinks(actor.organizationId, rows),
  ]);
  const locationName = new Map(locations.map((row) => [row.id, row.nameKa]));
  const userName = new Map(users.map((row) => [row.id, row.name]));
  let incoming = D(0);
  let outgoing = D(0);
  let value = D(0);
  for (const row of sums) {
    const quantity = D(row.quantity);
    if (quantity.gt(0)) incoming = incoming.plus(quantity);
    else outgoing = outgoing.plus(quantity.abs());
    value = value.plus(quantity.mul(row.unitCost));
  }
  return {
    showCost,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / MOVEMENT_PAGE_SIZE)),
    totals: { incoming, outgoing, value: showCost ? value : null },
    rows: rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurredAt,
      movementType: row.movementType,
      typeLabel: MOVEMENT_TYPE_LABEL[row.movementType] ?? row.movementType,
      code: row.variant.internalCode ?? row.variant.sku,
      sku: row.variant.sku,
      name: row.variant.nameKa,
      location: locationName.get(row.locationId) ?? "—",
      quantity: D(row.quantity),
      unitCost: showCost ? D(row.unitCost) : null,
      value: showCost ? D(row.quantity).mul(row.unitCost) : null,
      source: link(row.sourceType, row.sourceId),
      sourceId: row.sourceId,
      reason: row.reason,
      actor: row.actorId ? (userName.get(row.actorId) ?? null) : null,
    })),
  };
}
