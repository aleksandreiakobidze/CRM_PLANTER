import type { Actor } from "@/server/auth/permissions";
import { can, requirePermission } from "@/server/auth/permissions";
import { contains, getDb } from "@/server/db";
import { BusinessError } from "@/server/errors";
import { customerFilterOptions, customerListFilters, customerListWhere, type CustomerListParams } from "@/server/features/crm/customer-list";
import { listBalances } from "@/server/features/inventory/stock-service";
import { listMovements, type MovementFilters } from "@/server/features/inventory/movement-journal";
import { opsDashboard } from "@/server/features/reports/ops-reports";
import { excursionReport, type ExcursionReportFilters } from "@/server/features/reports/excursion-report";
import { crmReport, type CrmReportFilters } from "@/server/features/reports/crm-report";
import type { Bucket } from "@/server/features/reports/report-kit";
import { salesReport, type SalesReportFilters } from "@/server/features/reports/sales-report";
import { rentalReport, type RentalReportFilters } from "@/server/features/reports/rental-report";
import { purchaseReport, type PurchaseReportFilters } from "@/server/features/reports/purchase-report";
import { contractFee } from "@/server/features/maintenance/maintenance-service";
import { externalHref, hostLabel, PHOTO_ALLOWED_FIELD, photoAllowedLabel, PRIORITY, SEGMENT_LABEL, statusBadge, VERIFICATION } from "@/server/labels";
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
  sent: "გაგზავნილი",
  accepted: "მიღებული",
  declined: "უარყოფილი",
  ordered: "გაგზავნილი",
  partial: "ნაწილობრივ მიღებული",
  received: "მიღებული",
  paid: "გადახდილი",
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
  const filters = customerListFilters(params, options.types, options.zones, options.cities, options.regions);
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
      OR: query ? [{ sku: contains(query) }, { internalCode: contains(query) }, { nameKa: contains(query) }] : undefined,
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
          { header: "შიდა კოდი", kind: "text", width: 14 },
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
          variant.internalCode ?? "",
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
        { header: "შიდა კოდი", kind: "text", width: 14 },
        { header: "SKU", kind: "text", width: 16 },
        { header: "სახელი", kind: "text", width: 28 },
        { header: "ლოკაცია", kind: "text", width: 20 },
        { header: "ხელთ", kind: "qty", total: true },
        { header: "დაჯავშნილი", kind: "qty", total: true },
        { header: "გასაყიდი", kind: "qty", total: true },
        ...(showCost ? [{ header: "თვითღირებულება", kind: "cost" as const }] : []),
      ],
      rows: rows.map((row) => [
        row.code,
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
        { header: "შიდა კოდი", kind: "text", width: 14 },
        { header: "კოდი", kind: "text", width: 16 },
        { header: "SKU", kind: "text", width: 16 },
        { header: "სახელი", kind: "text", width: 28 },
        { header: "სტატუსი", kind: "text" },
      ],
      rows: assets.map((asset) => [asset.internalCode ?? "", asset.code, asset.variant.sku, asset.variant.nameKa, documentStatus(asset.status)]),
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
        { header: PHOTO_ALLOWED_FIELD, kind: "text", width: 22 },
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
        photoAllowedLabel(booking.photoAllowed),
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
  requirePermission(actor, "reports.sales.read");
  const from = fromIso || "2026-01-01";
  const to = toIso || from;
  const data = await opsDashboard(actor, from, to);
  if (!data.sales) throw new BusinessError("გაყიდვების რეპორტი ამ როლს არ ეჩვენება", "forbidden");
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

export async function movementsWorkbook(actor: Actor, filters: MovementFilters): Promise<ExportFile> {
  const data = await listMovements(actor, filters, { all: true });
  const columns: SheetSpec["columns"] = [
    { header: "თარიღი", kind: "text", width: 18 },
    { header: "ტიპი", kind: "text", width: 24 },
    { header: "შიდა კოდი", kind: "text", width: 14 },
    { header: "SKU", kind: "text", width: 16 },
    { header: "დასახელება", kind: "text", width: 30 },
    { header: "ლოკაცია", kind: "text", width: 18 },
    { header: "რაოდენობა", kind: "qty", total: true },
    ...(data.showCost ? [{ header: "ერთ. ღირებულება", kind: "cost" as const }, { header: "ღირებულება", kind: "money" as const, total: true }] : []),
    { header: "დოკუმენტი", kind: "text", width: 24 },
    { header: "მიზეზი", kind: "text", width: 28 },
    { header: "ავტორი", kind: "text", width: 18 },
  ];
  return file("მარაგის მოძრაობა", "movements", [
    {
      name: "მოძრაობა",
      columns,
      rows: data.rows.map((row) => [
        when(row.occurredAt),
        row.typeLabel,
        row.code,
        row.sku,
        row.name,
        row.location,
        excelNumber(row.quantity, 3),
        ...(data.showCost ? [excelNumber(row.unitCost, 4), excelNumber(row.value, 2)] : []),
        row.source.label,
        row.reason ?? "",
        row.actor ?? "",
      ]),
    },
  ], [filters.from, filters.to].filter(Boolean).join(" — ") || undefined);
}

function bucketSheet(name: string, header: string, rows: Bucket[], showMoney: boolean, quantityHeader = "ბავშვი"): SheetSpec {
  return {
    name,
    columns: [
      { header, kind: "text", width: 30 },
      { header: "ჯავშანი", kind: "int", total: true },
      { header: quantityHeader, kind: "int", total: true },
      ...(showMoney ? [{ header: "შემოსავალი", kind: "money" as const, total: true }] : []),
    ],
    rows: rows.map((row) => [row.label, row.count, row.quantity.toNumber(), ...(showMoney ? [excelNumber(row.amount, 2)] : [])]),
  };
}

export async function excursionReportWorkbook(actor: Actor, filters: ExcursionReportFilters): Promise<ExportFile> {
  const data = await excursionReport(actor, filters);
  const { totals } = data;
  return file(
    "ექსკურსიების რეპორტი",
    "excursion-report",
    [
      {
        name: "ჯამი",
        columns: [
          { header: "მაჩვენებელი", kind: "text", width: 26 },
          { header: "მნიშვნელობა", kind: "text", width: 18 },
        ],
        rows: [
          ["პერიოდი", `${data.period.from} — ${data.period.to}`],
          ["ჯავშანი", String(totals.bookings)],
          ["დასრულებული", String(totals.completed)],
          ["გაუქმებული", String(totals.cancelled)],
          ["დაგეგმილი ბავშვი", String(totals.planned)],
          ["მოვიდა", String(totals.attended)],
          ["ანგარიშსაწერი", String(totals.billable)],
          ["დასწრება", totals.attendanceRate == null ? "—" : `${totals.attendanceRate}%`],
          ["ფოტო ნებადართულია", String(totals.photoAllowed)],
          ...(data.showMoney ? [["შემოსავალი", totals.revenue?.toFixed(2) ?? "0.00"], ["საშუალო ბავშვზე", totals.perChild?.toFixed(2) ?? "—"]] : []),
        ],
      },
      {
        name: "ჯავშნები",
        columns: [
          { header: "ნომერი", kind: "text", width: 14 },
          { header: "დაწყება", kind: "text", width: 18 },
          { header: "კლიენტი", kind: "text", width: 28 },
          { header: "ტიპი", kind: "text", width: 14 },
          { header: "პროგრამა", kind: "text", width: 22 },
          { header: "შენიშვნა", kind: "text", width: 28, wrap: true },
          { header: "სივრცე", kind: "text", width: 16 },
          { header: "გიდი", kind: "text", width: 22 },
          { header: "სტატუსი", kind: "text", width: 16 },
          { header: PHOTO_ALLOWED_FIELD, kind: "text", width: 12 },
          { header: "დაგეგმილი", kind: "int", total: true },
          { header: "მოვიდა", kind: "int", total: true },
          { header: "ანგარიშსაწერი", kind: "int", total: true },
          ...(data.showMoney ? [{ header: "შემოსავალი", kind: "money" as const, total: true }] : []),
        ],
        rows: data.rows.map((row) => [
          row.number,
          when(row.startsAt),
          row.customer,
          row.segment,
          row.program,
          row.note,
          row.resource,
          row.guides.join(", "),
          row.statusLabel,
          photoAllowedLabel(row.photoAllowed),
          row.planned,
          row.attended,
          row.billable,
          ...(data.showMoney ? [row.revenue ? excelNumber(row.revenue, 2) : null] : []),
        ]),
      },
      bucketSheet("თვეები", "თვე", data.breakdowns.months, data.showMoney),
      bucketSheet("სკოლები", "კლიენტი", data.breakdowns.customers, data.showMoney),
      bucketSheet("პროგრამები", "პროგრამა", data.breakdowns.programs, data.showMoney),
      bucketSheet("გიდები", "გიდი", data.breakdowns.guides, data.showMoney),
    ],
    "ბავშვი: დასრულებულზე მოსული, დანარჩენზე დაგეგმილი. გაუქმებული არ ითვლება.",
  );
}

function countSheet(name: string, header: string, rows: Bucket[]): SheetSpec {
  return {
    name,
    columns: [
      { header, kind: "text", width: 30 },
      { header: "რაოდენობა", kind: "int", total: true },
    ],
    rows: rows.map((row) => [row.label, row.count]),
  };
}

export async function crmReportWorkbook(actor: Actor, filters: CrmReportFilters): Promise<ExportFile> {
  const data = await crmReport(actor, filters);
  const { totals } = data;
  return file("CRM რეპორტი", "crm-report", [
    {
      name: "ჯამი",
      columns: [
        { header: "მაჩვენებელი", kind: "text", width: 28 },
        { header: "მნიშვნელობა", kind: "text", width: 18 },
      ],
      rows: [
        ["პერიოდი", `${data.period.from} — ${data.period.to}`],
        ["კლიენტი", String(totals.customers)],
        ["მომხმარებელი", String(totals.active)],
        ["ახალი პერიოდში", String(totals.newCustomers)],
        ["ვადაგასული კონტაქტი", String(totals.overdueContacts)],
        ["შეთავაზება", String(totals.quotes)],
        ["უარყოფილი შეთავაზება", String(totals.declined)],
        ["დავალება შეიქმნა", String(totals.tasksCreated)],
        ["დავალება შესრულდა", String(totals.tasksDone)],
        ["ღია დავალება", String(totals.tasksOpen)],
        ["ვადაგასული დავალება", String(totals.tasksOverdue)],
      ],
    },
    {
      name: "ძაბრი",
      columns: [
        { header: "ეტაპი", kind: "text", width: 20 },
        { header: "შეთავაზება", kind: "int" },
        { header: "%", kind: "text" },
        ...(data.showMoney ? [{ header: "თანხა", kind: "money" as const }] : []),
      ],
      rows: data.funnel.map((row) => [row.label, row.count, row.rate == null ? "—" : `${row.rate}%`, ...(data.showMoney ? [row.value ? excelNumber(row.value, 2) : null] : [])]),
    },
    {
      name: "გუნდი",
      columns: [
        { header: "თანამშრომელი", kind: "text", width: 24 },
        { header: "შექმნა", kind: "int", total: true },
        { header: "მიეწერა", kind: "int", total: true },
        { header: "შეასრულა", kind: "int", total: true },
        { header: "ღია", kind: "int", total: true },
        { header: "ვადაგასული", kind: "int", total: true },
      ],
      rows: data.team.map((row) => [row.name, row.created, row.assigned, row.done, row.open, row.overdue]),
    },
    countSheet("სტატუსი", "სტატუსი", data.breakdowns.status),
    countSheet("ზონა", "ზონა", data.breakdowns.zones),
    countSheet("ტიპი", "ტიპი", data.breakdowns.types),
    countSheet("პრიორიტეტი", "პრიორიტეტი", data.breakdowns.priority),
    countSheet("პასუხისმგებელი", "პასუხისმგებელი", data.breakdowns.owners),
    {
      name: "ვადაგასული",
      columns: [
        { header: "კლიენტი", kind: "text", width: 30 },
        { header: "სტატუსი", kind: "text", width: 22 },
        { header: "პასუხისმგებელი", kind: "text", width: 20 },
        { header: "ტელეფონი", kind: "phone", width: 16 },
        { header: "შემდეგი კონტაქტი", kind: "date" },
        { header: "დაგვიანება (დღე)", kind: "int" },
      ],
      rows: data.overdue.map((row) => [row.name, row.status, row.owner, row.phone, excelDate(row.nextContactOn), row.days]),
    },
  ]);
}

function amountSheet(name: string, header: string, rows: Bucket[], showMoney: boolean, withQuantity = false): SheetSpec {
  return {
    name,
    columns: [
      { header, kind: "text", width: 34 },
      { header: "ჩანაწერი", kind: "int", total: true },
      ...(withQuantity ? [{ header: "რაოდენობა", kind: "qty" as const, total: true }] : []),
      ...(showMoney ? [{ header: "თანხა", kind: "money" as const, total: true }] : []),
    ],
    rows: rows.map((row) => [
      row.label,
      row.count,
      ...(withQuantity ? [excelNumber(row.quantity, 3)] : []),
      ...(showMoney ? [excelNumber(row.amount, 2)] : []),
    ]),
  };
}

export async function salesReportWorkbook(actor: Actor, filters: SalesReportFilters): Promise<ExportFile> {
  const data = await salesReport(actor, filters);
  const money = data.showMoney;
  return file("გაყიდვების რეპორტი", "sales-report", [
    {
      name: "ინვოისები",
      columns: [
        { header: "ნომერი", kind: "text", width: 16 },
        { header: "თარიღი", kind: "date" },
        { header: "კლიენტი", kind: "text", width: 30 },
        { header: "მენეჯერი", kind: "text", width: 20 },
        { header: "წყარო", kind: "text", width: 14 },
        { header: "ხაზი", kind: "int" },
        ...(money
          ? [
              { header: "დღგ-ს გარეშე", kind: "money" as const, total: true },
              { header: "სულ", kind: "money" as const, total: true },
              { header: "დარჩენილი", kind: "money" as const, total: true },
            ]
          : []),
      ],
      rows: data.rows.map((row) => [
        row.number,
        excelDate(row.issuedOn),
        row.customer,
        row.owner,
        row.source,
        row.lines,
        ...(money ? [excelNumber(row.net, 2), excelNumber(row.total, 2), excelNumber(row.remaining, 2)] : []),
      ]),
    },
    amountSheet("კლიენტები", "კლიენტი", data.breakdowns.customers, money),
    amountSheet("პროდუქტები", "პროდუქტი / მომსახურება", data.breakdowns.products, money, true),
    amountSheet("მენეჯერები", "მენეჯერი", data.breakdowns.owners, money),
    amountSheet("წყარო", "წყარო", data.breakdowns.sources, money),
    amountSheet("თვეები", "თვე", data.breakdowns.months, money),
    ...(money
      ? [
          {
            name: "ვადაგადაცილება",
            columns: [
              { header: "ინვოისი", kind: "text" as const },
              { header: "კლიენტი", kind: "text" as const, width: 28 },
              { header: "დარჩენილი", kind: "money" as const, total: true },
              { header: "დღე", kind: "int" as const },
              { header: "ჯგუფი", kind: "text" as const },
            ],
            rows: data.aging.map((row) => [row.number, row.customer, excelNumber(row.remaining, 2), row.days, row.bucket]),
          },
        ]
      : []),
  ]);
}

export async function rentalReportWorkbook(actor: Actor, filters: RentalReportFilters): Promise<ExportFile> {
  const data = await rentalReport(actor, filters);
  const money = data.showMoney;
  return file("გაქირავება და მოვლა", "rental-report", [
    {
      name: "აქტივები",
      columns: [
        { header: "კოდი", kind: "text", width: 14 },
        { header: "აქტივი", kind: "text", width: 28 },
        { header: "ლოკაცია", kind: "text", width: 18 },
        { header: "მდგომარეობა", kind: "text", width: 16 },
        { header: "ჯავშანი", kind: "int", total: true },
        { header: "დღე", kind: "int", total: true },
        { header: "დატვირთვა %", kind: "int" },
        ...(money ? [{ header: "შემოსავალი", kind: "money" as const, total: true }] : []),
      ],
      rows: data.assets.map((row) => [row.code, row.name, row.location, row.status, row.bookings, row.days, row.utilisation, ...(money ? [excelNumber(row.revenue, 2)] : [])]),
    },
    {
      name: "ჯავშნები",
      columns: [
        { header: "ნომერი", kind: "text", width: 16 },
        { header: "კლიენტი", kind: "text", width: 28 },
        { header: "დაწყება", kind: "date" },
        { header: "დასრულება", kind: "date" },
        { header: "ანგარიშის დღე", kind: "int" },
        { header: "დღე პერიოდში", kind: "int", total: true },
        { header: "აქტივი", kind: "int", total: true },
        { header: "სტატუსი", kind: "text", width: 18 },
        ...(money ? [{ header: "ჯამი", kind: "money" as const, total: true }, { header: "დეპოზიტი", kind: "money" as const, total: true }] : []),
      ],
      rows: data.rows.map((row) => [
        row.number,
        row.customer,
        excelDate(row.startOn),
        excelDate(row.endOn),
        row.billingDays,
        row.overlap,
        row.assets,
        row.statusLabel,
        ...(money ? [excelNumber(row.total, 2), excelNumber(row.deposit, 2)] : []),
      ]),
    },
    {
      name: "მოვლა",
      columns: [
        { header: "ნომერი", kind: "text", width: 16 },
        { header: "კლიენტი", kind: "text", width: 28 },
        { header: "დაწყება", kind: "date" },
        { header: "დასრულება", kind: "date" },
        { header: "სტატუსი", kind: "text" },
        { header: "მცენარე", kind: "qty", total: true },
        { header: "%", kind: "money" },
        ...(money ? [{ header: "საბაზისო", kind: "money" as const, total: true }, { header: "თვიური", kind: "money" as const, total: true }] : []),
      ],
      rows: data.contracts.map((row) => [
        row.number,
        row.customer,
        excelDate(row.startOn),
        excelDate(row.endOn),
        row.statusLabel,
        excelNumber(row.plants, 3),
        excelNumber(row.percent, 2),
        ...(money ? [excelNumber(row.base, 2), excelNumber(row.fee, 2)] : []),
      ]),
    },
    amountSheet("კლიენტები", "კლიენტი", data.breakdowns.customers, money, true),
  ]);
}

export async function purchaseReportWorkbook(actor: Actor, filters: PurchaseReportFilters): Promise<ExportFile> {
  const data = await purchaseReport(actor, filters);
  const money = data.showMoney;
  return file("შესყიდვების რეპორტი", "purchase-report", [
    {
      name: "შეკვეთები",
      columns: [
        { header: "ნომერი", kind: "text", width: 16 },
        { header: "თარიღი", kind: "text", width: 18 },
        { header: "მოსალოდნელი", kind: "date" },
        { header: "მიმწოდებელი", kind: "text", width: 26 },
        { header: "სტატუსი", kind: "text", width: 20 },
        { header: "ხაზი", kind: "int" },
        { header: "შეკვეთილი რაოდ.", kind: "qty", total: true },
        { header: "მიღებული რაოდ.", kind: "qty", total: true },
        ...(money
          ? [
              { header: "შეკვეთილი", kind: "money" as const, total: true },
              { header: "მიღებული", kind: "money" as const, total: true },
              { header: "დარჩენილი", kind: "money" as const, total: true },
              { header: "დამატებითი ხარჯი", kind: "money" as const, total: true },
            ]
          : []),
      ],
      rows: data.rows.map((row) => [
        row.number,
        when(row.createdAt),
        excelDate(row.expectedOn),
        row.supplier,
        row.statusLabel,
        row.lines,
        excelNumber(row.quantity, 3),
        excelNumber(row.receivedQty, 3),
        ...(money ? [excelNumber(row.ordered, 2), excelNumber(row.received, 2), excelNumber(row.outstanding, 2), excelNumber(row.landed, 2)] : []),
      ]),
    },
    {
      name: "მისაღები",
      columns: [
        { header: "შეკვეთა", kind: "text", width: 16 },
        { header: "მიმწოდებელი", kind: "text", width: 26 },
        { header: "შიდა კოდი", kind: "text", width: 14 },
        { header: "აითემი", kind: "text", width: 28 },
        { header: "მოსალოდნელი", kind: "date" },
        { header: "შეკვეთილი", kind: "qty" },
        { header: "მიღებული", kind: "qty" },
        { header: "დარჩა", kind: "qty", total: true },
        ...(money ? [{ header: "ღირებულება", kind: "money" as const, total: true }] : []),
      ],
      rows: data.outstandingLines.map((row) => [
        row.number,
        row.supplier,
        row.code,
        row.name,
        excelDate(row.expectedOn),
        excelNumber(row.quantity, 3),
        excelNumber(row.receivedQty, 3),
        excelNumber(row.open, 3),
        ...(money ? [excelNumber(row.value, 2)] : []),
      ]),
    },
    amountSheet("მიმწოდებლები", "მიმწოდებელი", data.breakdowns.suppliers, money, true),
    amountSheet("პროდუქტები", "პროდუქტი", data.breakdowns.products, money, true),
    amountSheet("თვეები", "თვე", data.breakdowns.months, money, true),
  ]);
}

function params<T extends string>(url: URL, keys: readonly T[]): Partial<Record<T, string>> {
  const out: Partial<Record<T, string>> = {};
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value) out[key] = value;
  }
  return out;
}

function movementFilters(url: URL): MovementFilters {
  return {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    locationId: url.searchParams.get("locationId") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
  };
}

const BUILDERS = {
  movements: (actor: Actor, url: URL) => movementsWorkbook(actor, movementFilters(url)),
  "excursion-report": (actor: Actor, url: URL) =>
    excursionReportWorkbook(actor, params(url, ["from", "to", "customerId", "programId", "guideId", "status", "photo"] as const)),
  "crm-report": (actor: Actor, url: URL) => crmReportWorkbook(actor, params(url, ["from", "to", "ownerId", "segment"] as const)),
  "sales-report": (actor: Actor, url: URL) => salesReportWorkbook(actor, params(url, ["from", "to", "customerId", "ownerId", "source"] as const)),
  "rental-report": (actor: Actor, url: URL) => rentalReportWorkbook(actor, params(url, ["from", "to", "customerId", "status"] as const)),
  "purchase-report": (actor: Actor, url: URL) => purchaseReportWorkbook(actor, params(url, ["from", "to", "supplierId", "status", "variantId"] as const)),
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
