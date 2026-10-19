import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import pg from "pg";

const file = process.argv.find((arg) => arg.endsWith(".xlsx"));
if (!process.argv.includes("--replace") || !file) {
  console.error("გაშვება: node scripts/import-horeca.mjs --replace <ფაილი.xlsx>");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL ?? "";
const databaseName = new URL(databaseUrl.replace(/^postgresql:/, "http:")).pathname.replace(/^\//, "");
if (databaseName !== "planter") {
  throw new Error(`ეს სკრიპტი მხოლოდ planter ბაზაზე ეშვება, ახლა არის ${databaseName || "ცარიელი"}`);
}

const STATUS = new Map([
  ["ახალი", "fresh"],
  ["უნდა დავაკონტაქტო", "to_contact"],
  ["შეთავაზება გავაგზავნე", "quote_sent"],
  ["მომხმარებელი გახდა", "customer"],
  ["არ სურს", "declined"],
]);

function textOf(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("").trim();
    if (value.hyperlink) return String(value.text || value.hyperlink).trim();
    if (value.text) return String(value.text).trim();
    if (value.result != null) return textOf(value.result);
  }
  return String(value).trim();
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

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(file);
const sheet = workbook.getWorksheet("B2B ბაზა") ?? workbook.worksheets[0];
const header = [];
sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
  header[col] = textOf(cell.value);
});
const index = new Map();
header.forEach((name, col) => {
  if (name) index.set(name, col);
});
function cell(row, name) {
  const col = index.get(name);
  return col ? textOf(row.getCell(col).value) : "";
}

const places = [];
for (let number = 2; number <= sheet.rowCount; number += 1) {
  const row = sheet.getRow(number);
  const name = cell(row, "დასახელება");
  if (!name) continue;
  const statusLabel = cell(row, "კონტაქტის სტატუსი");
  const status = STATUS.get(statusLabel);
  if (!status) throw new Error(`სტრიქონი ${number}: უცნობი სტატუსი ${statusLabel}`);
  const priority = cell(row, "Planter პრიორიტეტი");
  if (!["A", "B", "C"].includes(priority)) throw new Error(`სტრიქონი ${number}: უცნობი პრიორიტეტი ${priority}`);
  const verificationLabel = cell(row, "ვერიფიკაცია");
  if (verificationLabel !== "დადასტურებული") throw new Error(`სტრიქონი ${number}: უცნობი ვერიფიკაცია ${verificationLabel}`);
  const phone = cell(row, "ტელეფონი");
  places.push({
    name,
    venueType: cell(row, "ტიპი"),
    zone: cell(row, "ზონა"),
    address: cell(row, "მისამართი"),
    phone: phone || null,
    phoneNormalized: phone ? primaryPhone(phone) || null : null,
    website: cell(row, "ვებ / სოციალური") || null,
    mapsUrl: cell(row, "Google Maps") || null,
    source: cell(row, "წყარო") || null,
    priority,
    status,
    notes: cell(row, "შენიშვნა") || null,
  });
}
if (places.length === 0) throw new Error("ფაილში ობიექტი არ არის");

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

  await client.query(
    `with doomed as (
       select id from sales_orders where organization_id = $1
       union all select id from excursion_bookings where organization_id = $1
       union all select id from rental_bookings where organization_id = $1
       union all select id from fulfillments where organization_id = $1
     ),
     released as (
       select r.organization_id, r.variant_id, r.location_id, sum(r.quantity) as qty
       from reservations r
       join doomed d on d.id = r.source_id
       where r.status = 'confirmed'
       group by 1, 2, 3
     )
     update stock_balances sb
     set reserved = greatest(0, sb.reserved - released.qty)
     from released
     where sb.organization_id = released.organization_id
       and sb.variant_id = released.variant_id
       and sb.location_id = released.location_id`,
    [organizationId],
  );
  await client.query(
    `delete from reservations r
     using (
       select id from sales_orders where organization_id = $1
       union all select id from excursion_bookings where organization_id = $1
       union all select id from rental_bookings where organization_id = $1
       union all select id from fulfillments where organization_id = $1
     ) doomed
     where r.source_id = doomed.id`,
    [organizationId],
  );
  await client.query(
    `update rental_assets
     set status = 'available'
     where organization_id = $1 and status = 'reserved'`,
    [organizationId],
  );
  await client.query("delete from asset_reservations where organization_id = $1", [organizationId]);
  await client.query("delete from rental_booking_lines where booking_id in (select id from rental_bookings where organization_id = $1)", [organizationId]);
  await client.query("delete from deposit_transactions where booking_id in (select id from rental_bookings where organization_id = $1)", [organizationId]);
  await client.query("delete from rental_bookings where organization_id = $1", [organizationId]);
  await client.query("delete from staff_assignments where booking_id in (select id from excursion_bookings where organization_id = $1)", [organizationId]);
  await client.query("delete from resource_reservations where booking_id in (select id from excursion_bookings where organization_id = $1)", [organizationId]);
  await client.query("delete from material_usages where booking_id in (select id from excursion_bookings where organization_id = $1)", [organizationId]);
  await client.query("delete from excursion_bookings where organization_id = $1", [organizationId]);
  await client.query(
    `delete from replacement_cases
     where customer_plant_id in (
       select id from customer_plants where contract_id in (select id from maintenance_contracts where organization_id = $1)
     )`,
    [organizationId],
  );
  await client.query(
    "delete from customer_plants where contract_id in (select id from maintenance_contracts where organization_id = $1)",
    [organizationId],
  );
  await client.query(
    "update contract_plant_lines set replaces_line_id = null where contract_id in (select id from maintenance_contracts where organization_id = $1)",
    [organizationId],
  );
  await client.query("delete from contract_plant_lines where contract_id in (select id from maintenance_contracts where organization_id = $1)", [organizationId]);
  await client.query("delete from contract_amendments where contract_id in (select id from maintenance_contracts where organization_id = $1)", [organizationId]);
  await client.query("delete from maintenance_contracts where organization_id = $1", [organizationId]);
  await client.query(
    `delete from payment_allocations
     where payment_id in (select id from payments where organization_id = $1)
        or invoice_id in (select id from invoices where organization_id = $1)`,
    [organizationId],
  );
  await client.query("update payments set refund_of_id = null where organization_id = $1", [organizationId]);
  await client.query("delete from payments where organization_id = $1", [organizationId]);
  await client.query("delete from invoice_lines where invoice_id in (select id from invoices where organization_id = $1)", [organizationId]);
  await client.query("delete from invoices where organization_id = $1", [organizationId]);
  await client.query("delete from fulfillment_lines where fulfillment_id in (select id from fulfillments where organization_id = $1)", [organizationId]);
  await client.query("delete from fulfillments where organization_id = $1", [organizationId]);
  await client.query("delete from sales_return_lines where return_id in (select id from sales_returns where organization_id = $1)", [organizationId]);
  await client.query("delete from sales_returns where organization_id = $1", [organizationId]);
  await client.query("delete from sales_order_lines where order_id in (select id from sales_orders where organization_id = $1)", [organizationId]);
  await client.query("delete from sales_orders where organization_id = $1", [organizationId]);
  await client.query("delete from quote_lines where quote_id in (select id from quotes where organization_id = $1)", [organizationId]);
  await client.query("delete from quotes where organization_id = $1", [organizationId]);
  await client.query("delete from customer_credits where organization_id = $1", [organizationId]);
  await client.query("delete from activities where organization_id = $1", [organizationId]);
  await client.query("delete from contacts where organization_id = $1", [organizationId]);
  await client.query("delete from addresses where organization_id = $1", [organizationId]);
  await client.query("update tasks set customer_id = null where organization_id = $1", [organizationId]);
  await client.query("update customers set merged_into_id = null where organization_id = $1", [organizationId]);
  await client.query("delete from customers where organization_id = $1", [organizationId]);

  for (const place of places) {
    const customerId = randomUUID();
    await client.query(
      `insert into customers (
         id, organization_id, kind, name, segment, relationship_status, do_not_contact,
         region, city, district, venue_type, phone, phone_normalized, website, maps_url,
         source, priority, verification, notes, owner_id, created_at, updated_at
       ) values (
         $1, $2, 'company', $3, 'horeca', $4, false,
         'საბურთალო', 'თბილისი', $5, $6, $7, $8, $9, $10,
         $11, $12, 'verified', $13, $14, now(), now()
       )`,
      [
        customerId, organizationId, place.name, place.status,
        place.zone || null, place.venueType || null, place.phone, place.phoneNormalized,
        place.website, place.mapsUrl, place.source, place.priority, place.notes, ownerId,
      ],
    );
    if (place.address) {
      await client.query(
        `insert into addresses (id, organization_id, customer_id, label, line1, city, region, district)
         values ($1, $2, $3, 'ობიექტი', $4, 'თბილისი', 'საბურთალო', $5)`,
        [randomUUID(), organizationId, customerId, place.address, place.zone || null],
      );
    }
  }

  const check = await client.query(
    `select count(*)::int as n,
            count(*) filter (where phone is not null)::int as phones,
            count(*) filter (where priority = 'A')::int as a,
            count(*) filter (where website is not null)::int as webs
     from customers where organization_id = $1`,
    [organizationId],
  );
  const expected = {
    n: places.length,
    phones: places.filter((place) => place.phone).length,
    a: places.filter((place) => place.priority === "A").length,
    webs: places.filter((place) => place.website).length,
  };
  const actual = check.rows[0];
  if (actual.n !== expected.n || actual.phones !== expected.phones || actual.a !== expected.a || actual.webs !== expected.webs) {
    throw new Error(`შემოწმება არ დაემთხვა: ${JSON.stringify({ expected, actual })}`);
  }
  const reserved = await client.query("select coalesce(sum(reserved), 0) as reserved from stock_balances where organization_id = $1", [organizationId]);
  await client.query("COMMIT");
  console.log(JSON.stringify({ organization: orgs.rows[0].name, ...actual, reserved: reserved.rows[0].reserved }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
