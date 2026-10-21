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
};

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
    types: places.venue_type,
    zones: places.district,
    cities: places.city,
    regions: places.region,
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
