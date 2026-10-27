import type { Prisma } from "@/generated/prisma/client";
import { contains, getDb } from "@/server/db";
import { listPlaceOptions, syncPlaceCatalog } from "@/server/features/crm/place-terms";

export type CustomerListParams = {
  q?: string;
  status?: string;
  type?: string;
  zone?: string;
  city?: string;
  region?: string;
  priority?: string;
  phone?: string;
  web?: string;
  verified?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

export const CUSTOMER_PAGE_SIZE = 25;
export const CUSTOMER_SORTS = ["name", "priority", "status", "next"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];
export type CustomerListView = { sort: CustomerSort; dir: "asc" | "desc"; page: number };

export function customerListView(params: CustomerListParams): CustomerListView {
  const sort = (CUSTOMER_SORTS as readonly string[]).includes(params.sort ?? "") ? (params.sort as CustomerSort) : "priority";
  const dir = params.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  return { sort, dir, page };
}

export function customerOrderBy(view: CustomerListView): Prisma.CustomerOrderByWithRelationInput[] {
  const { dir } = view;
  if (view.sort === "name") return [{ name: dir }, { id: "asc" }];
  if (view.sort === "status") return [{ relationshipStatus: dir }, { name: "asc" }, { id: "asc" }];
  if (view.sort === "next") return [{ nextContactOn: { sort: dir, nulls: "last" } }, { name: "asc" }, { id: "asc" }];
  return [{ priority: { sort: dir, nulls: "last" } }, { name: "asc" }, { id: "asc" }];
}

export async function customerStatusCounts(organizationId: string, filters: CustomerListFilters) {
  const rows = await getDb().customer.groupBy({
    by: ["relationshipStatus"],
    where: customerListWhere(organizationId, { ...filters, status: "" }),
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  let all = 0;
  for (const row of rows) {
    counts[row.relationshipStatus] = row._count._all;
    all += row._count._all;
  }
  return { all, counts };
}

export type CustomerListFilters = {
  q: string;
  status: string;
  type: string;
  zone: string;
  city: string;
  region: string;
  priority: string;
  phone: string;
  web: string;
  verified: string;
};

const STATUSES = ["", "fresh", "to_contact", "quote_sent", "customer", "declined"];

function chosen(value: string | undefined, allowed: string[]) {
  return value && allowed.includes(value) ? value : "";
}

export async function customerFilterOptions(organizationId: string) {
  const db = getDb();
  const base = { organizationId, mergedIntoId: null };
  await syncPlaceCatalog(organizationId);
  const [places, total] = await Promise.all([
    listPlaceOptions(organizationId),
    db.customer.count({ where: base }),
  ]);
  return {
    total,
    types: places.venue_type.map((item) => item.name),
    zones: places.district.map((item) => item.name),
    cities: places.city.map((item) => item.name),
    regions: places.region.map((item) => item.name),
    typeChoices: places.venue_type,
    zoneChoices: places.district,
    cityChoices: places.city,
    regionChoices: places.region,
  };
}

export function customerListFilters(
  params: CustomerListParams,
  types: string[],
  zones: string[],
  cities: string[] = [],
  regions: string[] = [],
): CustomerListFilters {
  return {
    q: params.q?.trim() ?? "",
    status: chosen(params.status, STATUSES),
    type: chosen(params.type, types),
    zone: chosen(params.zone, zones),
    city: chosen(params.city, cities),
    region: chosen(params.region, regions),
    priority: chosen(params.priority, ["", "A", "B", "C"]),
    phone: chosen(params.phone, ["", "yes", "no"]),
    web: chosen(params.web, ["", "yes", "no"]),
    verified: chosen(params.verified, ["", "yes", "no"]),
  };
}

export function customerListWhere(organizationId: string, filters: CustomerListFilters): Prisma.CustomerWhereInput {
  return {
    organizationId,
    mergedIntoId: null,
    relationshipStatus: filters.status || undefined,
    venueType: filters.type || undefined,
    district: filters.zone || undefined,
    city: filters.city || undefined,
    region: filters.region || undefined,
    priority: filters.priority || undefined,
    ...(filters.phone === "yes" ? { phone: { not: null } } : {}),
    ...(filters.phone === "no" ? { phone: null } : {}),
    ...(filters.web === "yes" ? { website: { not: null } } : {}),
    ...(filters.web === "no" ? { website: null } : {}),
    ...(filters.verified === "yes" ? { verification: "verified" } : {}),
    ...(filters.verified === "no" ? { verification: null } : {}),
    ...(filters.q
      ? {
          OR: [
            { name: contains(filters.q) },
            { identificationCode: contains(filters.q) },
            { email: contains(filters.q) },
            { phone: contains(filters.q) },
            { phoneNormalized: contains(filters.q) },
            { venueType: contains(filters.q) },
            { district: contains(filters.q) },
            { city: contains(filters.q) },
            { region: contains(filters.q) },
            { website: contains(filters.q) },
            { addresses: { some: { line1: contains(filters.q) } } },
          ],
        }
      : {}),
  };
}
