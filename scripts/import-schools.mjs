import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import "dotenv/config";
import pg from "pg";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const file = process.argv.find((arg) => arg.endsWith(".xlsx"));
if (!process.argv.includes("--replace") || !file) {
  console.error("გაშვება: node scripts/import-schools.mjs --replace <ფაილი.xlsx>");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL ?? "";
const databaseName = new URL(databaseUrl.replace(/^postgresql:/, "http:")).pathname.replace(/^\//, "");
if (databaseName !== "planter") {
  throw new Error(`ეს სკრიპტი მხოლოდ planter ბაზაზე ეშვება, ახლა არის ${databaseName || "ცარიელი"}`);
}

const STATUS = new Map([
  ["დასაკავშირებელი", "to_contact"],
  ["ახალი", "fresh"],
  ["უნდა დავაკონტაქტო", "to_contact"],
  ["შეთავაზება გავაგზავნე", "quote_sent"],
  ["მომხმარებელი გახდა", "customer"],
  ["არ სურს", "declined"],
]);
const ADDRESS_PLACEHOLDER = "გადასამოწმებელია";
const COMMERCIAL = [
  "quotes",
  "sales_orders",
  "invoices",
  "payments",
  "customer_credits",
  "rental_bookings",
  "maintenance_contracts",
  "excursion_bookings",
];

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function colNumber(ref) {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function zipPath(target) {
  const cleaned = target.replace(/^\//, "");
  return cleaned.startsWith("xl/") ? cleaned : `xl/${cleaned.replace(/^\.\//, "")}`;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const items = [];
  const parts = xml.split(/<[^>]*\bsi\b[^>]*>/i).slice(1);
  for (const part of parts) {
    const texts = [...part.matchAll(/<[^>]*\bt\b[^>]*>([^<]*)<\/[^>]*\bt\s*>/g)].map((match) => decodeXml(match[1]));
    items.push(texts.join(""));
  }
  return items;
}

function cellText(cellXml, shared) {
  const type = /\bt="([^"]+)"/.exec(cellXml)?.[1] ?? "";
  if (type === "inlineStr") {
    const texts = [...cellXml.matchAll(/<[^>]*\bt\b[^>]*>([^<]*)<\/[^>]*\bt\s*>/g)].map((match) => decodeXml(match[1]));
    return texts.join("").trim();
  }
  const value = /<[^>]*\bv\b[^>]*>([^<]*)<\/[^>]*\bv\s*>/.exec(cellXml)?.[1] ?? "";
  if (type === "s") return String(shared[Number(value)] ?? "").trim();
  if (type === "str" || type === "b") return decodeXml(value).trim();
  return decodeXml(value).trim();
}

function parseSheetRows(xml, shared) {
  const rows = [];
  const rowChunks = xml.split(/<[^>]*\brow\b[^>]*>/i).slice(1);
  for (const chunk of rowChunks) {
    const cells = [];
    const cellRe = /<[^>]*\bc\b[^>]*\/>|<[^>]*\bc\b[^>]*>[\s\S]*?<\/[^>]*\bc\s*>/g;
    let match;
    while ((match = cellRe.exec(chunk))) {
      const cellXml = match[0];
      const ref = /\br="([A-Z]+\d+)"/i.exec(cellXml)?.[1];
      if (!ref) continue;
      cells[colNumber(ref)] = cellText(cellXml, shared);
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

async function readNamedSheet(path, sheetName) {
  const zip = await JSZip.loadAsync(await readFile(path));
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbookXml || !relsXml) throw new Error("Excel ფაილი არ იკითხება");
  const sheets = [];
  const sheetRe = /<[^>]*\bsheet\b[^>]*\/?>/g;
  let tag;
  while ((tag = sheetRe.exec(workbookXml))) {
    const name = /name="([^"]*)"/.exec(tag[0])?.[1];
    const rid = /r:id="([^"]*)"/.exec(tag[0])?.[1];
    if (name && rid) sheets.push({ name: decodeXml(name), rid });
  }
  const targets = new Map();
  const relRe = /<Relationship\b[^>]*>/g;
  while ((tag = relRe.exec(relsXml))) {
    const id = /\bId="([^"]*)"/.exec(tag[0])?.[1];
    const target = /\bTarget="([^"]*)"/.exec(tag[0])?.[1];
    if (id && target) targets.set(id, zipPath(target));
  }
  const chosen = sheets.find((sheet) => sheet.name === sheetName) ?? sheets[0];
  if (!chosen) throw new Error("ფურცელი არ არის");
  const sheetFile = zip.file(targets.get(chosen.rid) ?? "");
  if (!sheetFile) throw new Error(`ფურცელი ვერ გაიხსნა: ${chosen.name}`);
  const sharedFile = zip.file("xl/sharedStrings.xml");
  const shared = parseSharedStrings(sharedFile ? await sharedFile.async("string") : "");
  return parseSheetRows(await sheetFile.async("string"), shared);
}

function normalizePhone(input) {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("995") && digits.length === 12) return `+${digits}`;
  if (digits.length === 9 && digits.startsWith("5")) return `+995${digits}`;
  if (trimmed.startsWith("+")) return `+${digits}`;
  return digits;
}

function primaryPhone(input) {
  const parts = input.split(/[/|,;]+/).map((part) => normalizePhone(part.trim())).filter(Boolean);
  return parts.find((part) => part.startsWith("+9955")) || parts[0] || "";
}

const rows = await readNamedSheet(file, "სკოლების CRM");
const header = rows[0] ?? [];
const index = new Map();
header.forEach((name, col) => {
  if (name) index.set(name, col);
});
function cell(row, name) {
  const col = index.get(name);
  return col ? String(row[col] ?? "").trim() : "";
}

const places = [];
for (let number = 1; number < rows.length; number += 1) {
  const row = rows[number];
  const name = cell(row, "სკოლის დასახელება");
  if (!name) continue;
  const statusLabel = cell(row, "სტატუსი");
  const status = STATUS.get(statusLabel);
  if (!status) throw new Error(`სტრიქონი ${number + 1}: უცნობი სტატუსი ${statusLabel}`);
  const priority = cell(row, "პრიორიტეტი");
  if (!["A", "B", "C"].includes(priority)) throw new Error(`სტრიქონი ${number + 1}: უცნობი პრიორიტეტი ${priority}`);
  const phone = cell(row, "ტელეფონი");
  const address = cell(row, "მისამართი");
  const city = cell(row, "ქალაქი") || null;
  const district = cell(row, "რაიონი") || city;
  const email = cell(row, "ელფოსტა").toLowerCase();
  const venueType = cell(row, "კატეგორია");
  if (!venueType) throw new Error(`სტრიქონი ${number + 1}: კატეგორია ცარიელია`);
  places.push({
    name,
    venueType,
    region: cell(row, "რეგიონი") || null,
    city,
    district: district || null,
    address: address && address !== ADDRESS_PLACEHOLDER ? address : "",
    phone: phone || null,
    phoneNormalized: phone ? primaryPhone(phone) || null : null,
    email: email || null,
    website: cell(row, "ვებგვერდი") || null,
    mapsUrl: cell(row, "Google Maps") || null,
    identificationCode: cell(row, "ს/კ") || null,
    source: cell(row, "წყარო") || null,
    priority,
    status,
    notes: cell(row, "შენიშვნა") || null,
  });
}
if (places.length === 0) throw new Error("ფაილში სკოლა არ არის");
const venueTypes = [...new Set(places.map((place) => place.venueType))];

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("BEGIN");
  const orgs = await client.query("select id, name from organizations order by name");
  if (orgs.rows.length !== 1) throw new Error("მოსალოდნელია ერთი ორგანიზაცია");
  const organizationId = orgs.rows[0].id;
  const owner = await client.query(
    `select u.id
     from memberships m
     join users u on u.id = m.user_id
     where m.organization_id = $1
     order by case when u.email = 'demo-admin@planter.test' then 0 else 1 end, u.email
     limit 1`,
    [organizationId],
  );
  const ownerId = owner.rows[0]?.id ?? null;
  const schoolMatch = "organization_id = $1 and segment = 'school' and venue_type = any($2::text[])";
  const before = await client.query(
    `select
       count(*) filter (where segment = 'horeca')::int as horeca,
       count(*) filter (where segment = 'school')::int as school,
       count(*) filter (where ${schoolMatch})::int as replaced
     from customers where organization_id = $1`,
    [organizationId, venueTypes],
  );

  const linked = await client.query(
    `select ${COMMERCIAL.map((table) => `exists(select 1 from ${table} t where t.customer_id = c.id)`).join(" or ")} as busy
     from customers c
     where ${schoolMatch}`,
    [organizationId, venueTypes],
  );
  if (linked.rows.some((row) => row.busy)) {
    throw new Error("სკოლის კლიენტზე შეკვეთა ან ინვოისია — --replace ვერ წაშლის");
  }

  await client.query(
    `update tasks set customer_id = null
     where organization_id = $1 and customer_id in (select id from customers where ${schoolMatch})`,
    [organizationId, venueTypes],
  );
  await client.query(
    `delete from activities
     where organization_id = $1 and customer_id in (select id from customers where ${schoolMatch})`,
    [organizationId, venueTypes],
  );
  await client.query(
    `delete from contacts
     where organization_id = $1 and customer_id in (select id from customers where ${schoolMatch})`,
    [organizationId, venueTypes],
  );
  await client.query(
    `delete from addresses
     where organization_id = $1 and customer_id in (select id from customers where ${schoolMatch})`,
    [organizationId, venueTypes],
  );
  await client.query(`update customers set merged_into_id = null where ${schoolMatch}`, [organizationId, venueTypes]);
  await client.query(`delete from customers where ${schoolMatch}`, [organizationId, venueTypes]);

  for (const place of places) {
    const customerId = randomUUID();
    await client.query(
      `insert into customers (
         id, organization_id, kind, name, identification_code, segment, relationship_status, do_not_contact,
         region, city, district, venue_type, phone, phone_normalized, email, website, maps_url,
         source, priority, notes, owner_id, created_at, updated_at
       ) values (
         $1, $2, 'company', $3, $4, 'school', $5, false,
         $6, $7, $8, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18, now(), now()
       )`,
      [
        customerId, organizationId, place.name, place.identificationCode, place.status,
        place.region, place.city, place.district, place.venueType, place.phone, place.phoneNormalized,
        place.email, place.website, place.mapsUrl, place.source, place.priority, place.notes, ownerId,
      ],
    );
    if (place.address) {
      await client.query(
        `insert into addresses (id, organization_id, customer_id, label, line1, city, region, district)
         values ($1, $2, $3, 'ობიექტი', $4, $5, $6, $7)`,
        [randomUUID(), organizationId, customerId, place.address, place.city, place.region, place.district],
      );
    }
  }

  const check = await client.query(
    `select
       count(*) filter (where segment = 'school')::int as school,
       count(*) filter (where segment = 'horeca')::int as horeca,
       count(*) filter (where ${schoolMatch})::int as imported,
       count(*) filter (where segment = 'school' and not (venue_type = any($2::text[])))::int as other_school,
       count(*) filter (where ${schoolMatch} and priority = 'A')::int as a,
       count(*) filter (where ${schoolMatch} and email is not null)::int as emails,
       count(*) filter (where ${schoolMatch} and maps_url is not null)::int as maps
     from customers where organization_id = $1`,
    [organizationId, venueTypes],
  );
  const expected = {
    school: before.rows[0].school - before.rows[0].replaced + places.length,
    horeca: before.rows[0].horeca,
    imported: places.length,
    other_school: before.rows[0].school - before.rows[0].replaced,
    a: places.filter((place) => place.priority === "A").length,
    emails: places.filter((place) => place.email).length,
    maps: places.filter((place) => place.mapsUrl).length,
  };
  const actual = check.rows[0];
  if (
    actual.school !== expected.school
    || actual.horeca !== expected.horeca
    || actual.imported !== expected.imported
    || actual.other_school !== expected.other_school
    || actual.a !== expected.a
    || actual.emails !== expected.emails
    || actual.maps !== expected.maps
  ) {
    throw new Error(`შემოწმება არ დაემთხვა: ${JSON.stringify({ expected, actual })}`);
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({ organization: orgs.rows[0].name, venueTypes, ...actual }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
