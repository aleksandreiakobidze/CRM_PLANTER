import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import "dotenv/config";
import pg from "pg";
import { readDataSheet } from "./xlsx-rows.mjs";

const files = process.argv.slice(2).filter((arg) => arg.endsWith(".xlsx"));
if (files.length === 0) {
  console.error("გაშვება: node scripts/import-b2b.mjs <ფაილი.xlsx> [...]");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL ?? "";
const databaseName = new URL(databaseUrl.replace(/^postgresql:/, "http:")).pathname.replace(/^\//, "");
if (databaseName !== "planter") {
  throw new Error(`ეს სკრიპტი მხოლოდ planter ბაზაზე ეშვება, ახლა არის ${databaseName || "ცარიელი"}`);
}

const STATUS = new Map([
  ["ახალი", "fresh"],
  ["დასაკავშირებელი", "to_contact"],
  ["უნდა დავაკონტაქტო", "to_contact"],
  ["კიდე უნდა დავაკონტაქტო", "to_contact"],
  ["შეთავაზება გავაგზავნე", "quote_sent"],
  ["მომხმარებელი გახდა", "customer"],
  ["არ სურს", "declined"],
]);
const ADDRESS_PLACEHOLDER = "გადასამოწმებელია";
const NAME_HEADERS = ["დასახელება", "კომპანია / ოფისი", "ქარხანა / საწარმოო ობიექტი", "სკოლის დასახელება"];

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

function fold(value) {
  return String(value ?? "")
    .toLocaleLowerCase("ka")
    .replace(/[«»„“"'`’]/g, "")
    .replace(/[()[\].,;:/\\|_+\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(row, index, names) {
  for (const name of names) {
    const col = index.get(name);
    if (col) {
      const value = String(row[col] ?? "").trim();
      if (value) return value;
    }
  }
  return "";
}

function headerIndex(rows) {
  for (let i = 0; i < Math.min(rows.length, 8); i += 1) {
    const values = (rows[i] ?? []).filter(Boolean);
    if (values.some((value) => NAME_HEADERS.includes(value))) return i;
  }
  return 0;
}

function segmentFor(file, category) {
  const lower = file.toLowerCase();
  if (lower.includes("office")) return "office";
  if (lower.includes("school")) return "school";
  if (/(horeca|saburtalo|vake|vera|remaining)/i.test(lower)) return "horeca";
  const cat = (category || "").toLocaleLowerCase("ka");
  if (cat.includes("ოფის")) return "office";
  if (cat.includes("სკოლ") || cat.includes("ბაღ")) return "school";
  if (/(რესტორან|კაფე|ბარი|საცხობ|სწრაფი კვება|ho\s?re\s?ca)/i.test(cat)) return "horeca";
  return "other";
}

function cityRegion(file, region, cityOrDistrict) {
  const tbilisiFile = /tbilisi|saburtalo|vake|vera|remaining/i.test(file);
  if (region === "თბილისი" || (!region && tbilisiFile)) {
    return { region: region || "თბილისი", city: "თბილისი", district: cityOrDistrict || null };
  }
  return {
    region: region || null,
    city: cityOrDistrict || null,
    district: cityOrDistrict || null,
  };
}

function placeKey(name, district, address) {
  return `${fold(name)}|${fold(district) || fold(address)}`;
}

const places = [];
const fileStats = [];
for (const file of files) {
  const { name: sheetName, rows } = await readDataSheet(file);
  const headAt = headerIndex(rows);
  const header = rows[headAt] ?? [];
  const index = new Map();
  header.forEach((name, col) => {
    if (name) index.set(name, col);
  });
  let read = 0;
  for (let number = headAt + 1; number < rows.length; number += 1) {
    const row = rows[number];
    const name = pick(row, index, NAME_HEADERS);
    if (!name) continue;
    const statusLabel = pick(row, index, ["კონტაქტის სტატუსი", "სტატუსი"]);
    const status = STATUS.get(statusLabel) ?? (statusLabel ? null : "fresh");
    if (!status) throw new Error(`${basename(file)} სტრიქონი ${number + 1}: უცნობი სტატუსი ${statusLabel}`);
    const priority = pick(row, index, ["Planter პრიორიტეტი", "პრიორიტეტი"]) || "C";
    if (!["A", "B", "C"].includes(priority)) throw new Error(`${basename(file)} სტრიქონი ${number + 1}: უცნობი პრიორიტეტი ${priority}`);
    const phone = pick(row, index, ["ტელეფონი"]);
    const address = pick(row, index, ["მისამართი", "მისამართი / ლოკაცია"]);
    const category = pick(row, index, ["კატეგორია", "ტიპი", "ოფისის ტიპი"]);
    const venueType = pick(row, index, ["ქვეტიპი", "ტიპი", "ოფისის ტიპი", "კატეგორია"]) || null;
    const zone = pick(row, index, ["ზონა", "უბანი", "უბანი / რაიონი", "რაიონი", "ქალაქი / უბანი"]);
    const region = pick(row, index, ["რეგიონი"]);
    const cityCol = pick(row, index, ["ქალაქი", "ქალაქი / მუნიციპალიტეტი"]);
    const place = cityRegion(file, region, cityCol || zone);
    const website = pick(row, index, ["ვებგვერდი", "ვებ / სოციალური", "ვებგვერდი / წყარო"]);
    const source = pick(row, index, ["წყარო"]) || website || null;
    const email = pick(row, index, ["ელფოსტა"]).toLowerCase();
    const verification = pick(row, index, ["ვერიფიკაცია"]) === "დადასტურებული" ? "verified" : null;
    read += 1;
    places.push({
      file: basename(file),
      name,
      venueType,
      segment: segmentFor(file, category),
      region: place.region,
      city: place.city,
      district: place.district,
      address: address && address !== ADDRESS_PLACEHOLDER ? address : "",
      phone: phone || null,
      phoneNormalized: phone ? primaryPhone(phone) || null : null,
      email: email || null,
      website: website || null,
      mapsUrl: pick(row, index, ["Google Maps"]) || null,
      identificationCode: pick(row, index, ["ს/კ"]) || null,
      source,
      priority,
      status,
      verification,
      notes: pick(row, index, ["შენიშვნა", "შენიშვნა / შემდეგი ნაბიჯი"]) || null,
    });
  }
  fileStats.push({ file: basename(file), sheet: sheetName, read });
}
if (places.length === 0) throw new Error("ფაილებში ობიექტი არ არის");

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
  const before = await client.query(
    `select
       count(*)::int as total,
       count(*) filter (where segment = 'horeca')::int as horeca,
       count(*) filter (where segment = 'school')::int as school,
       count(*) filter (where segment = 'office')::int as office
     from customers where organization_id = $1 and merged_into_id is null`,
    [organizationId],
  );
  const existing = await client.query(
    `select c.name, c.district, c.phone_normalized, c.email, c.identification_code, a.line1
     from customers c
     left join addresses a on a.customer_id = c.id
     where c.organization_id = $1 and c.merged_into_id is null`,
    [organizationId],
  );
  const keys = new Set();
  const phones = new Set();
  const emails = new Set();
  const codes = new Set();
  function remember(place) {
    keys.add(placeKey(place.name, place.district, place.address || place.line1));
    if (place.phoneNormalized) phones.add(`${fold(place.name)}|${place.phoneNormalized}`);
    if (place.email) emails.add(`${fold(place.name)}|${place.email.toLowerCase()}`);
    if (place.identificationCode) codes.add(place.identificationCode);
  }
  for (const row of existing.rows) remember({ ...row, address: row.line1 });

  let created = 0;
  let skipped = 0;
  const skippedByFile = new Map();
  const createdByFile = new Map();
  for (const place of places) {
    const duplicate =
      keys.has(placeKey(place.name, place.district, place.address))
      || (place.phoneNormalized && phones.has(`${fold(place.name)}|${place.phoneNormalized}`))
      || (place.email && emails.has(`${fold(place.name)}|${place.email}`))
      || (place.identificationCode && codes.has(place.identificationCode));
    if (duplicate) {
      skipped += 1;
      skippedByFile.set(place.file, (skippedByFile.get(place.file) ?? 0) + 1);
      continue;
    }
    const customerId = randomUUID();
    await client.query(
      `insert into customers (
         id, organization_id, kind, name, identification_code, segment, relationship_status, do_not_contact,
         region, city, district, venue_type, phone, phone_normalized, email, website, maps_url,
         source, priority, verification, notes, owner_id, created_at, updated_at
       ) values (
         $1, $2, 'company', $3, $4, $5, $6, false,
         $7, $8, $9, $10, $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20, now(), now()
       )`,
      [
        customerId, organizationId, place.name, place.identificationCode, place.segment, place.status,
        place.region, place.city, place.district, place.venueType, place.phone, place.phoneNormalized,
        place.email, place.website, place.mapsUrl, place.source, place.priority, place.verification, place.notes, ownerId,
      ],
    );
    if (place.address) {
      await client.query(
        `insert into addresses (id, organization_id, customer_id, label, line1, city, region, district)
         values ($1, $2, $3, 'ობიექტი', $4, $5, $6, $7)`,
        [randomUUID(), organizationId, customerId, place.address, place.city, place.region, place.district],
      );
    }
    remember(place);
    created += 1;
    createdByFile.set(place.file, (createdByFile.get(place.file) ?? 0) + 1);
  }

  const after = await client.query(
    `select
       count(*)::int as total,
       count(*) filter (where segment = 'horeca')::int as horeca,
       count(*) filter (where segment = 'school')::int as school,
       count(*) filter (where segment = 'office')::int as office
     from customers where organization_id = $1 and merged_into_id is null`,
    [organizationId],
  );
  if (after.rows[0].total !== before.rows[0].total + created) {
    throw new Error(`რაოდენობა არ დაემთხვა: ${JSON.stringify({ before: before.rows[0], after: after.rows[0], created })}`);
  }
  if (after.rows[0].school < before.rows[0].school) throw new Error("სკოლები შემცირდა");
  await client.query("COMMIT");
  console.log(JSON.stringify({
    organization: orgs.rows[0].name,
    files: fileStats.map((stat) => ({
      ...stat,
      created: createdByFile.get(stat.file) ?? 0,
      skipped: skippedByFile.get(stat.file) ?? 0,
    })),
    created,
    skipped,
    before: before.rows[0],
    after: after.rows[0],
  }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
