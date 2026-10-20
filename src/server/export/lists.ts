import type { Actor } from "@/server/auth/permissions";
import { can } from "@/server/auth/permissions";
import { contains, getDb } from "@/server/db";
import { BusinessError } from "@/server/errors";
import { customerFilterOptions, customerListFilters, customerListWhere, type CustomerListParams } from "@/server/features/crm/customer-list";
import { listBalances } from "@/server/features/inventory/stock-service";
import { opsDashboard } from "@/server/features/reports/ops-reports";
import { contractFee } from "@/server/features/maintenance/maintenance-service";
import { externalHref, hostLabel, PRIORITY, SEGMENT_LABEL, statusBadge, VERIFICATION } from "@/server/labels";
import { D } from "@/server/money";
import { displayPhone } from "@/server/phone";
import { formatInTimeZone } from "date-fns-tz";
import { BUSINESS_TIME_ZONE } from "@/server/time";
import { buildWorkbook, excelDate, excelNumber, type SheetCell, type SheetSpec } from "@/server/export/workbook";

const KIND_LABEL: Record<string, string> = { company: "კომპანია", person: "ფიზიკური პირი" };
const CATEGORY_LABEL: Record<string, string> = {
  plant: "მცენარე",
  pot: "ქოთანი",
  soil: "მიწა/სუბსტრატი",
  service: "მომსახურება",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "დრაფტი",
  posted: "გატარებული",
  converted: "შეკვეთა გახდა",
  confirmed: "დადასტურებული",
  cancelled: "გაუქმებული",
  fulfilled: "გაცემული",
  open: "ღია",
  authorized: "ავტორიზებული",
  rs_error: "RS შეცდომა",
  available: "თავისუფალი",
  reserved: "დაჯავშნილი",
  on_rent: "გაქირავებული",
  out: "გატანილი",
  returned: "დაბრუნებული",
  partially_returned: "ნაწილობრივ დაბრუნებული",
  lost: "დაკარგული",
  damaged: "დაზიანებული",
  active: "აქტიური",
  paused: "შეჩერებული",
  ended: "დასრულებული",
  closed: "დახურული",
  requested: "მოთხოვნილი",
  completed: "დასრულებული",
};

export type ExportFile = { filename: string; fallback: string; bytes: Uint8Array };

function documentStatus(code: string) {
  return STATUS_LABEL[code] ?? statusBadge(code).label;
}

function yesNo(value: boolean) {
  return value ? "კი" : "არა";
}

function phoneText(phone: string | null, normalized: string | null) {
  const shown = displayPhone(phone, normalized);
  return shown === "—" ? null : shown;
}

function linkCell(url: string | null | undefined, text?: string): SheetCell {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) return null;
  try {
    const href = externalHref(trimmed);
    const parsed = new URL(href);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return trimmed;
    return { text: text || hostLabel(trimmed), href };
  } catch {
    return trimmed;
  }
}

function priorityCell(code: string | null): SheetCell {
  if (!code || !PRIORITY[code]) return null;
  return { text: PRIORITY[code].label, color: `FF${PRIORITY[code].color.slice(1).toUpperCase()}` };
}

function stampName(name: string, fallback: string) {
  const day = formatInTimeZone(new Date(), BUSINESS_TIME_ZONE, "yyyy-MM-dd");
  return { filename: `${name}-${day}.xlsx`, fallback: `planter-${fallback}-${day}.xlsx` };
}

function when(value: Date | null | undefined) {
  if (!value) return null;
  return formatInTimeZone(value, BUSINESS_TIME_ZONE, "yyyy-MM-dd HH:mm");
}

async function file(title: string, fallback: string, sheets: SheetSpec[], note?: string): Promise<ExportFile> {
  const names = stampName(title, fallback);
  return { ...names, bytes: await buildWorkbook({ title, note, sheets }) };
}

export async function customersWorkbook(actor: Actor, params: CustomerListParams): Promise<ExportFile> {
  const options = await customerFilterOptions(actor.organizationId);
  const filters = customerListFilters(params, options.types, options.zones);
  const customers = await getDb().customer.findMany({
    where: customerListWhere(actor.organizationId, filters),
    include: { addresses: { orderBy: { line1: "asc" } } },
    orderBy: [{ priority: "asc" }, { name: "asc" }, { district: "asc" }],
  });
  const active = Object.values(filters).some(Boolean);
  return file(
    "კლიენტები",
    "customers",
    [
      {
        name: "კლიენტები",
        columns: [
          { header: "ობიექტი", kind: "text", width: 28 },
          { header: "კომპანია თუ პირი", kind: "text" },
          { header: "ტიპი", kind: "text", width: 22 },
          { header: "სეგმენტი", kind: "text" },
          { header: "ზონა", kind: "text" },
          { header: "ქალაქი", kind: "text" },
          { header: "რეგიონი", kind: "text" },
          { header: "მისამართი", kind: "text", width: 32, wrap: true },
          { header: "ტელეფონი", kind: "phone", width: 22 },
          { header: "ელფოსტა", kind: "text", width: 24 },
          { header: "ვებგვერდი", kind: "text", width: 18 },
          { header: "რუკა", kind: "text" },
          { header: "წყარო", kind: "text", width: 18 },
          { header: "პრიორიტეტი", kind: "text", width: 16 },
          { header: "ვერიფიკაცია", kind: "text" },
          { header: "სტატუსი", kind: "text", width: 24 },
          { header: "შემდეგი კონტაქტი", kind: "date", width: 18 },
          { header: "საიდენტიფიკაციო", kind: "text" },
          { header: "შენიშვნა", kind: "text", width: 36, wrap: true },
          { header: "აღარ დამიკავშირდეთ", kind: "text" },
        ],
        rows: customers.map((customer) => [
          customer.name,
          KIND_LABEL[customer.kind] ?? customer.kind,
          customer.venueType,
          SEGMENT_LABEL[customer.segment] ?? customer.segment,
          customer.district,
          customer.city,
          customer.region,
          customer.addresses.map((address) => address.line1).filter(Boolean).join(" · ") || null,
          phoneText(customer.phone, customer.phoneNormalized),
          customer.email,
          linkCell(customer.website),
          linkCell(customer.mapsUrl, "რუკა"),
          linkCell(customer.source),
          priorityCell(customer.priority),
          customer.verification ? (VERIFICATION[customer.verification]?.label ?? customer.verification) : null,
          statusBadge(customer.relationshipStatus).label,
          excelDate(customer.nextContactOn),
          customer.identificationCode,
          customer.notes,
          customer.doNotContact ? "კი" : null,
        ]),
      },
    ],
    active ? "მიმდინარე ფილტრი" : undefined,
  );
}

export async function quotesWorkbook(actor: Actor): Promise<ExportFile> {
  const quotes = await getDb().quote.findMany({
    where: { organizationId: actor.organizationId },
    include: { customer: true, lines: true },
    orderBy: { createdAt: "desc" },
  });
  return file("შეთავაზებები", "quotes", [
    {
      name: "შეთავაზებები",
      columns: [
        { header: "ნომერი", kind: "text", width: 16 },
        { header: "კლიენტი", kind: "text", width: 28 },
        { header: "სტატუსი", kind: "text" },
        { header: "ვარგისია", kind: "date" },
        { header: "შეიქმნა", kind: "text", width: 18 },
        { header: "ჯამი", kind: "money", total: true },
      ],
      rows: quotes.map((quote) => {
        const total = quote.lines.reduce((sum, line) => sum.plus(D(line.lineTotal)), D(0));
        return [
          quote.number,
          quote.customer.name,
          documentStatus(quote.status),
          excelDate(quote.validUntil),
          when(quote.createdAt),
          excelNumber(total, 2),
        ];
      }),
    },
  ]);
}

export async function invoicesWorkbook(actor: Actor): Promise<ExportFile> {
  if (!can(actor, "finance.read")) throw new BusinessError("ფინანსებზე წვდომა არ გაქვთ", "forbidden");
  const invoices = await getDb().invoice.findMany({
    where: { organizationId: actor.organizationId },
    include: { customer: true, allocations: true },
    orderBy: { createdAt: "desc" },
  });
  return file("ინვოისები", "invoices", [
    {
      name: "ინვოისები",
      columns: [
        { header: "ნომერი", kind: "text", width: 16 },
        { header: "კლიენტი", kind: "text", width: 28 },
        { header: "სტატუსი", kind: "text" },
        { header: "გაცემის თარიღი", kind: "date" },
        { header: "ვადა", kind: "date" },
        { header: "ჯამი", kind: "money", total: true },
        { header: "გადახდილი", kind: "money", total: true },
        { header: "დარჩენილი", kind: "money", total: true },
      ],
      rows: invoices.map((invoice) => {
        const paid = invoice.allocations.reduce((sum, row) => sum.plus(D(row.amount)), D(0));
        const total = D(invoice.total);
        return [
          invoice.number ?? "დრაფტი",
          invoice.customer.name,
          documentStatus(invoice.status),
          excelDate(invoice.issuedOn),
          excelDate(invoice.dueOn),
          excelNumber(total, 2),
          excelNumber(paid, 2),
          excelNumber(total.minus(paid), 2),
        ];
      }),
    },
  ]);
}

export async function productsWorkbook(actor: Actor, q: string): Promise<ExportFile> {
  const query = q.trim();
  const showCost = can(actor, "stock.cost.read");
  const variants = await getDb().productVariant.findMany({
    where: {
      organizationId: actor.organizationId,
      OR: query ? [{ sku: contains(query) }, { nameKa: contains(query) }] : undefined,
    },
    include: { product: true },
    orderBy: { sku: "asc" },
  });
  return file(
    "პროდუქტები",
    "products",
    [
      {
        name: "პროდუქტები",
        columns: [
          { header: "SKU", kind: "text", width: 16 },
          { header: "სახელი", kind: "text", width: 28 },
          { header: "კატეგორია", kind: "text" },
          { header: "ფასი", kind: "money" },
          ...(showCost ? [{ header: "თვითღირებულება", kind: "cost" as const }] : []),
          { header: "სიმაღლე სმ", kind: "qty" },
          { header: "ქოთანი ლ", kind: "qty" },
          { header: "გასაყიდი", kind: "text" },
          { header: "გასაქირავებელი", kind: "text" },
          { header: "აქტიური", kind: "text" },
        ],
        rows: variants.map((variant) => [
          variant.sku,
          variant.nameKa,
          CATEGORY_LABEL[variant.product.category] ?? variant.product.category,
          excelNumber(variant.listPrice, 2),
          ...(showCost ? [excelNumber(variant.averageCost, 4)] : []),
          excelNumber(variant.heightCm, 2),
          excelNumber(variant.potVolumeLiters, 3),
          yesNo(variant.sellable),
          yesNo(variant.rentable),
          yesNo(variant.active),
        ]),
      },
    ],
    query ? "მიმდინარე ფილტრი" : undefined,
  );
}

export async function inventoryWorkbook(actor: Actor): Promise<ExportFile> {
  if (!can(actor, "stock.read")) throw new BusinessError("მარაგზე წვდომა არ გაქვთ", "forbidden");
  const rows = await listBalances(actor);
  const showCost = rows.some((row) => row.unitCost != null) || can(actor, "stock.cost.read");
  return file("მარაგები", "inventory", [
    {
      name: "მარაგები",
      columns: [
        { header: "SKU", kind: "text", width: 16 },
        { header: "სახელი", kind: "text", width: 28 },
        { header: "ლოკაცია", kind: "text", width: 20 },
        { header: "ხელთ", kind: "qty", total: true },
        { header: "დაჯავშნილი", kind: "qty", total: true },
        { header: "გასაყიდი", kind: "qty", total: true },
        ...(showCost ? [{ header: "თვითღირებულება", kind: "cost" as const }] : []),
      ],
      rows: rows.map((row) => [
        row.sku,
        row.name,
        row.location,
        excelNumber({ toString: () => row.onHand }, 3),
        excelNumber({ toString: () => row.reserved }, 3),
        excelNumber({ toString: () => row.sellable }, 3),
        ...(showCost ? [row.unitCost ? excelNumber({ toString: () => row.unitCost }, 4) : null] : []),
      ]),
    },
  ]);
}

export async function rentalWorkbook(actor: Actor): Promise<ExportFile> {
  const [assets, bookings] = await Promise.all([
    getDb().rentalAsset.findMany({
      where: { organizationId: actor.organizationId },
      include: { variant: true },
      orderBy: { code: "asc" },
    }),
    getDb().rentalBooking.findMany({
      where: { organizationId: actor.organizationId },
      include: { customer: true },
      orderBy: { startOn: "asc" },
    }),
  ]);
  return file("გაქირავება", "rental", [
    {
      name: "ფონდი",
      columns: [
        { header: "კოდი", kind: "text", width: 16 },
        { header: "SKU", kind: "text", width: 16 },
        { header: "სახელი", kind: "text", width: 28 },
        { header: "სტატუსი", kind: "text" },
      ],
      rows: assets.map((asset) => [asset.code, asset.variant.sku, asset.variant.nameKa, documentStatus(asset.status)]),
    },
    {
      name: "ჯავშნები",
      columns: [
        { header: "ნომერი", kind: "text", width: 16 },
        { header: "კლიენტი", kind: "text", width: 28 },
        { header: "სტატუსი", kind: "text" },
        { header: "დაწყება", kind: "date" },
        { header: "დასრულება", kind: "date" },
        { header: "დღეები", kind: "int", total: true },
        { header: "ჯამი", kind: "money", total: true },
        { header: "დეპოზიტი", kind: "money", total: true },
      ],
      rows: bookings.map((booking) => [
        booking.number,
        booking.customer.name,
        documentStatus(booking.status),
        excelDate(booking.startOn),
        excelDate(booking.endOn),
        booking.billingDays,
        excelNumber(booking.total, 2),
        excelNumber(booking.depositAmount, 2),
      ]),
    },
  ]);
}

export async function maintenanceWorkbook(actor: Actor): Promise<ExportFile> {
  const contracts = await getDb().maintenanceContract.findMany({
    where: { organizationId: actor.organizationId },
    include: { customer: true },
    orderBy: { number: "desc" },
  });
  const fees = await Promise.all(contracts.map(async (contract) => ({ id: contract.id, fee: await contractFee(contract.id) })));
  return file("მოვლა", "maintenance", [
    {
      name: "ხელშეკრულებები",
      columns: [
        { header: "ნომერი", kind: "text", width: 16 },
        { header: "კლიენტი", kind: "text", width: 28 },
        { header: "სტატუსი", kind: "text" },
        { header: "პროცენტი", kind: "qty" },
        { header: "თვიური", kind: "money", total: true },
        { header: "დაწყება", kind: "date" },
        { header: "დასრულება", kind: "date" },
      ],
      rows: contracts.map((contract) => [
        contract.number,
        contract.customer.name,
        documentStatus(contract.status),
        excelNumber(contract.percent, 2),
        excelNumber({ toString: () => fees.find((fee) => fee.id === contract.id)?.fee.fee ?? "0" }, 2),
        excelDate(contract.startOn),
        excelDate(contract.endOn),
      ]),
    },
  ]);
}

export async function excursionsWorkbook(actor: Actor): Promise<ExportFile> {
  const bookings = await getDb().excursionBooking.findMany({
    where: { organizationId: actor.organizationId },
    include: { customer: true, program: true },
    orderBy: { startsAt: "asc" },
  });
  return file("ექსკურსიები", "excursions", [
    {
      name: "ჯავშნები",
      columns: [
        { header: "ნომერი", kind: "text", width: 16 },
        { header: "კლიენტი", kind: "text", width: 28 },
        { header: "შენიშვნა", kind: "text", width: 28 },
        { header: "ფასი", kind: "money" },
        { header: "სტატუსი", kind: "text" },
        { header: "დაწყება", kind: "text", width: 18 },
        { header: "დასრულება", kind: "text", width: 18 },
        { header: "დაგეგმილი", kind: "int", total: true },
        { header: "მოვიდა", kind: "int", total: true },
        { header: "ანგარიშსაწერი", kind: "int", total: true },
      ],
      rows: bookings.map((booking) => [
        booking.number,
        booking.customer.name,
        booking.note.trim() || booking.program?.nameKa || "",
        excelNumber(booking.price, 2),
        documentStatus(booking.status),
        when(booking.startsAt),
        when(booking.endsAt),
        booking.plannedChildren,
        booking.attendedChildren,
        booking.billableChildren,
      ]),
    },
  ]);
}

export async function reportsWorkbook(actor: Actor, fromIso: string, toIso: string): Promise<ExportFile> {
  const from = fromIso || "2026-01-01";
  const to = toIso || from;
  const data = await opsDashboard(actor, from, to);
  return file("რეპორტები", "reports", [
    {
      name: "KPI",
      columns: [
        { header: "მაჩვენებელი", kind: "text", width: 22 },
        { header: "თანხა", kind: "money" },
        { header: "ბაზისი", kind: "text", width: 40, wrap: true },
      ],
      rows: [
        ["გაყიდული", excelNumber({ toString: () => data.sales.sold }, 2), data.sales.basis.sold],
        ["დარიცხული", excelNumber({ toString: () => data.sales.invoiced }, 2), data.sales.basis.invoiced],
        ["შემოსული", excelNumber({ toString: () => data.sales.received }, 2), data.sales.basis.received],
        ["ვადაგადაცილება", excelNumber({ toString: () => data.overdue }, 2), "ინვოისის remaining"],
        ["ინტეგრაცია", null, data.integration],
      ],
    },
    {
      name: "დავალიანება",
      columns: [
        { header: "ინვოისი", kind: "text" },
        { header: "კლიენტი", kind: "text", width: 24 },
        { header: "დარჩენილი", kind: "money", total: true },
        { header: "დღეები", kind: "int" },
        { header: "ჯგუფი", kind: "text" },
      ],
      rows: data.aging.map((row) => [row.number, row.customer, excelNumber({ toString: () => row.remaining }, 2), row.days, row.bucket]),
    },
  ], `${from} — ${to}`);
}

const BUILDERS = {
  customers: (actor: Actor, url: URL) =>
    customersWorkbook(actor, {
      q: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      zone: url.searchParams.get("zone") ?? undefined,
      priority: url.searchParams.get("priority") ?? undefined,
      phone: url.searchParams.get("phone") ?? undefined,
      web: url.searchParams.get("web") ?? undefined,
      verified: url.searchParams.get("verified") ?? undefined,
    }),
  quotes: (actor: Actor) => quotesWorkbook(actor),
  invoices: (actor: Actor) => invoicesWorkbook(actor),
  products: (actor: Actor, url: URL) => productsWorkbook(actor, url.searchParams.get("q") ?? ""),
  inventory: (actor: Actor) => inventoryWorkbook(actor),
  rental: (actor: Actor) => rentalWorkbook(actor),
  maintenance: (actor: Actor) => maintenanceWorkbook(actor),
  excursions: (actor: Actor) => excursionsWorkbook(actor),
  reports: (actor: Actor, url: URL) => reportsWorkbook(actor, url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? ""),
} as const;

export async function buildExport(kind: string, actor: Actor, url: URL): Promise<ExportFile> {
  const builder = BUILDERS[kind as keyof typeof BUILDERS];
  if (!builder) throw new BusinessError("ეს სია ვერ გადმოიწერება", "not_found");
  return builder(actor, url);
}
