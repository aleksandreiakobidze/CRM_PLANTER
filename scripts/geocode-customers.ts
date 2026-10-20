import "dotenv/config";
import { mapsQuery } from "@/components/place-map";
import { getDb } from "@/server/db";

const WAIT_MS = 1100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function locate(query: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ge");
  url.searchParams.set("q", query);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "PlanterCRM/1.0 (local customer map)",
        Accept: "application/json",
        "Accept-Language": "ka",
      },
    });
    if (response.status === 429 || response.status >= 500) {
      await sleep(WAIT_MS * (attempt + 2));
      continue;
    }
    if (!response.ok) return null;
    const rows = (await response.json()) as { lat?: string; lon?: string }[];
    const hit = rows[0];
    if (!hit?.lat || !hit.lon) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat: lat.toFixed(6), lng: lng.toFixed(6) };
  }
  return null;
}

async function main() {
  const db = getDb();
  const customers = await db.customer.findMany({
    where: { mergedIntoId: null, latitude: null, mapsUrl: { not: null } },
    include: { addresses: { take: 1, orderBy: { line1: "asc" } } },
    orderBy: { name: "asc" },
  });
  customers.sort((left, right) => Number(right.venueType === "კერძო სკოლა") - Number(left.venueType === "კერძო სკოლა"));
  let placed = 0;
  let missed = 0;
  for (const [index, customer] of customers.entries()) {
    const fallback = [customer.name, customer.addresses[0]?.line1, customer.city, "საქართველო"].filter(Boolean).join(", ");
    const query = mapsQuery(customer.mapsUrl, fallback);
    const short = [customer.name, customer.city, "საქართველო"].filter(Boolean).join(", ");
    const tries = [...new Set([query, short].filter(Boolean))];
    let point: { lat: string; lng: string } | null = null;
    for (let attempt = 0; attempt < tries.length; attempt += 1) {
      if (attempt > 0) await sleep(WAIT_MS);
      point = await locate(tries[attempt]);
      if (point) break;
    }
    if (point) {
      await db.customer.update({ where: { id: customer.id }, data: { latitude: point.lat, longitude: point.lng } });
      placed += 1;
    } else {
      missed += 1;
    }
    if ((index + 1) % 25 === 0 || index + 1 === customers.length) {
      console.log(`${index + 1}/${customers.length} შენახული ${placed}, ვერ მოიძებნა ${missed}`);
    }
    await sleep(WAIT_MS);
  }
  console.log(`დასრულდა. შენახული ${placed}, ვერ მოიძებნა ${missed}`);
}

void main();
