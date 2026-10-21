import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { getDb, type Tx } from "@/server/db";
import { BusinessError } from "@/server/errors";

export const PLACE_KINDS = ["district", "city", "region", "venue_type"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const PLACE_KIND_LABEL: Record<PlaceKind, string> = {
  district: "ზონა",
  city: "ქალაქი",
  region: "რეგიონი",
  venue_type: "ობიექტის ტიპი",
};

const DEFAULTS: Record<PlaceKind, readonly string[]> = {
  region: [
    "თბილისი",
    "აჭარა",
    "იმერეთი",
    "კახეთი",
    "ქვემო ქართლი",
    "შიდა ქართლი",
    "სამეგრელო-ზემო სვანეთი",
    "სამცხე-ჯავახეთი",
    "გურია",
    "მცხეთა-მთიანეთი",
    "რაჭა-ლეჩხუმი და ქვემო სვანეთი",
    "აფხაზეთი",
  ],
  city: [
    "თბილისი",
    "ბათუმი",
    "ქუთაისი",
    "რუსთავი",
    "ფოთი",
    "ზუგდიდი",
    "გორი",
    "თელავი",
    "მცხეთა",
    "ხაშური",
    "ბორჯომი",
    "ახალციხე",
    "ოზურგეთი",
    "ქობულეთი",
    "მარნეული",
    "გარდაბანი",
  ],
  district: [
    "ვაკე",
    "საბურთალო",
    "მთაწმინდა",
    "სოლოლაკი",
    "ვერა",
    "ავლაბარი",
    "ჩუღურეთი",
    "დიდუბე",
    "ნაძალადევი",
    "გლდანი",
    "ისანი",
    "სამგორი",
    "კრწანისი",
    "დიღომი",
    "ვაჟა-ფშაველა",
    "ორთაჭალა",
    "ლილო",
  ],
  venue_type: [
    "რესტორანი",
    "კაფე",
    "ბარი",
    "სასტუმრო",
    "ოფისი",
    "სკოლა",
    "კლინიკა",
    "მაღაზია",
    "ბანკი",
    "IT / ტექნოლოგია",
    "დაზღვევა",
    "ლოგისტიკა",
    "წარმოება",
  ],
};

function cleanName(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function isKind(value: string): value is PlaceKind {
  return PLACE_KINDS.includes(value as PlaceKind);
}

export async function ensurePlaceTerms(
  db: Tx | ReturnType<typeof getDb>,
  organizationId: string,
  items: { kind: PlaceKind; name?: string | null }[],
) {
  const data = items
    .map((item) => ({ kind: item.kind, name: cleanName(item.name) }))
    .filter((item) => item.name)
    .map((item) => ({ organizationId, kind: item.kind, name: item.name }));
  if (data.length === 0) return;
  await db.placeTerm.createMany({ data, skipDuplicates: true });
}

export async function seedPlaceTerms(db: Tx | ReturnType<typeof getDb>, organizationId: string) {
  const data = PLACE_KINDS.flatMap((kind) =>
    DEFAULTS[kind].map((name) => ({ organizationId, kind, name })),
  );
  await db.placeTerm.createMany({ data, skipDuplicates: true });
}

export async function syncPlaceCatalog(organizationId: string) {
  const db = getDb();
  const [customers, addresses] = await Promise.all([
    db.customer.findMany({
      where: { organizationId, mergedIntoId: null },
      select: { district: true, city: true, region: true, venueType: true },
    }),
    db.address.findMany({
      where: { organizationId },
      select: { district: true, city: true, region: true },
    }),
  ]);
  await seedPlaceTerms(db, organizationId);
  await ensurePlaceTerms(db, organizationId, [
    ...customers.flatMap((row) => [
      { kind: "district" as const, name: row.district },
      { kind: "city" as const, name: row.city },
      { kind: "region" as const, name: row.region },
      { kind: "venue_type" as const, name: row.venueType },
    ]),
    ...addresses.flatMap((row) => [
      { kind: "district" as const, name: row.district },
      { kind: "city" as const, name: row.city },
      { kind: "region" as const, name: row.region },
    ]),
  ]);
}

export async function listPlaceOptions(organizationId: string) {
  const count = await getDb().placeTerm.count({ where: { organizationId } });
  if (count === 0) await syncPlaceCatalog(organizationId);
  const rows = await getDb().placeTerm.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
  const grouped = {
    district: [] as string[],
    city: [] as string[],
    region: [] as string[],
    venue_type: [] as string[],
  };
  for (const row of rows) {
    if (isKind(row.kind)) grouped[row.kind].push(row.name);
  }
  return grouped;
}

export async function listPlaceTerms(organizationId: string) {
  await syncPlaceCatalog(organizationId);
  return getDb().placeTerm.findMany({
    where: { organizationId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
}

export async function addPlaceTerm(actor: Actor, kind: string, name: string) {
  requirePermission(actor, "crm.write");
  if (!isKind(kind)) throw new BusinessError("ტიპი არასწორია", "validation");
  const cleaned = cleanName(name);
  if (!cleaned) throw new BusinessError("სახელი სავალდებულოა", "validation");
  try {
    return await getDb().placeTerm.create({
      data: { organizationId: actor.organizationId, kind, name: cleaned },
    });
  } catch {
    throw new BusinessError("ეს ჩანაწერი უკვე არის", "duplicate");
  }
}

export async function deletePlaceTerm(actor: Actor, id: string) {
  requirePermission(actor, "crm.write");
  const row = await getDb().placeTerm.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!row) throw new BusinessError("ჩანაწერი ვერ მოიძებნა", "not_found");
  await getDb().placeTerm.delete({ where: { id: row.id } });
  return row;
}

export function selectOptions(names: string[], empty = "—") {
  return [{ value: "", label: empty }, ...names.map((name) => ({ value: name, label: name }))];
}
