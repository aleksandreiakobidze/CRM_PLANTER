import { cleanPlaceCode, nextPlaceCode, placeCodeTaken, rememberPlaceCode } from "@/lib/place-code";
import type { Actor } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/permissions";
import { getDb, type Tx } from "@/server/db";
import { BusinessError } from "@/server/errors";

export type PlaceOption = { name: string; code: string };

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

async function catalogState(db: Tx | ReturnType<typeof getDb>, organizationId: string) {
  const rows = await db.placeTerm.findMany({
    where: { organizationId },
    select: { kind: true, name: true, code: true },
  });
  const have = new Set(rows.map((row) => `${row.kind}\0${row.name}`));
  const taken = new Set<string>();
  for (const row of rows) rememberPlaceCode(taken, row.code);
  return { have, taken };
}

export async function ensurePlaceTerms(
  db: Tx | ReturnType<typeof getDb>,
  organizationId: string,
  items: { kind: PlaceKind; name?: string | null }[],
) {
  const incoming = items
    .map((item) => ({ kind: item.kind, name: cleanName(item.name) }))
    .filter((item) => item.name);
  if (incoming.length === 0) return;
  const { have, taken } = await catalogState(db, organizationId);
  const data: { organizationId: string; kind: PlaceKind; name: string; code: string }[] = [];
  for (const item of incoming) {
    const key = `${item.kind}\0${item.name}`;
    if (have.has(key)) continue;
    const code = nextPlaceCode(item.name, taken);
    rememberPlaceCode(taken, code);
    have.add(key);
    data.push({ organizationId, kind: item.kind, name: item.name, code });
  }
  if (data.length === 0) return;
  await db.placeTerm.createMany({ data });
}

export async function seedPlaceTerms(db: Tx | ReturnType<typeof getDb>, organizationId: string) {
  await ensurePlaceTerms(
    db,
    organizationId,
    PLACE_KINDS.flatMap((kind) => DEFAULTS[kind].map((name) => ({ kind, name }))),
  );
}

function generatedPlaceCode(code: string, id: string) {
  const cleaned = cleanPlaceCode(code);
  if (!cleaned) return true;
  if (cleaned === `p-${id.replace(/-/g, "")}`) return true;
  return /^c[a-z0-9]{20,}$/i.test(cleaned);
}

export async function backfillPlaceCodes(db: Tx | ReturnType<typeof getDb>, organizationId: string) {
  const rows = await db.placeTerm.findMany({ where: { organizationId } });
  const taken = new Set<string>();
  for (const row of rows) {
    if (!generatedPlaceCode(row.code, row.id)) rememberPlaceCode(taken, row.code);
  }
  for (const row of rows) {
    if (!generatedPlaceCode(row.code, row.id)) continue;
    const code = nextPlaceCode(row.name, taken);
    rememberPlaceCode(taken, code);
    if (code !== row.code) await db.placeTerm.update({ where: { id: row.id }, data: { code } });
  }
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
  await backfillPlaceCodes(db, organizationId);
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
    district: [] as PlaceOption[],
    city: [] as PlaceOption[],
    region: [] as PlaceOption[],
    venue_type: [] as PlaceOption[],
  };
  for (const row of rows) {
    if (isKind(row.kind)) grouped[row.kind].push({ name: row.name, code: row.code });
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

export async function addPlaceTerm(actor: Actor, kind: string, name: string, code: string) {
  requirePermission(actor, "crm.write");
  if (!isKind(kind)) throw new BusinessError("ტიპი არასწორია", "validation");
  const cleaned = cleanName(name);
  if (!cleaned) throw new BusinessError("სახელი სავალდებულოა", "validation");
  const cleanedCode = cleanPlaceCode(code);
  if (!cleanedCode) throw new BusinessError("კოდი სავალდებულოა", "validation");
  const { taken } = await catalogState(getDb(), actor.organizationId);
  if (placeCodeTaken(taken, cleanedCode)) throw new BusinessError("კოდი უკვე გამოყენებულია", "duplicate");
  try {
    return await getDb().placeTerm.create({
      data: { organizationId: actor.organizationId, kind, name: cleaned, code: cleanedCode },
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

export function placeOption(term: PlaceOption) {
  return {
    value: term.name,
    label: term.code ? `${term.name} · ${term.code}` : term.name,
    search: `${term.name} ${term.code}`,
  };
}

export function selectOptions(terms: PlaceOption[], empty = "—") {
  return [{ value: "", label: empty }, ...terms.map(placeOption)];
}
