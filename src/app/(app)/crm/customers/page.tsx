import Link from "next/link";
import { CustomerBoard } from "@/components/customer-board";
import { CustomerFilters } from "@/components/customer-filters";
import { X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import {
  CUSTOMER_PAGE_SIZE,
  CUSTOMER_SORTS,
  customerFilterOptions,
  customerListFilters,
  customerListView,
  customerListWhere,
  customerOrderBy,
  customerStatusCounts,
  type CustomerListFilters,
  type CustomerListParams,
  type CustomerListView,
  type CustomerSort,
} from "@/server/features/crm/customer-list";
import { placeOption } from "@/server/features/crm/place-terms";
import { PRIORITY, RELATIONSHIP, statusBadge } from "@/server/labels";
import { displayPhone, primaryPhone } from "@/server/phone";
import { formatDateOnly, formatGeorgianShortDate, tbilisiDateString } from "@/server/time";
import { cn } from "@/lib/utils";

const PRIORITY_FILTER = [
  { value: "", label: "ყველა" },
  { value: "A", label: "A · მაღალი" },
  { value: "B", label: "B · საშუალო" },
  { value: "C", label: "C · დაბალი" },
];
const PRESENCE = [
  { value: "", label: "ყველა" },
  { value: "yes", label: "აქვს" },
  { value: "no", label: "არ აქვს" },
];
const VERIFIED = [
  { value: "", label: "ყველა" },
  { value: "yes", label: "დადასტურებული" },
  { value: "no", label: "დაუდასტურებელი" },
];
const STATUS_TABS = ["", "fresh", "to_contact", "quote_sent", "customer", "declined"];

type Query = Record<string, string>;

function filterQuery(filters: CustomerListFilters): Query {
  const query: Query = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value) query[key] = value;
  }
  return query;
}

function viewQuery(view: CustomerListView): Query {
  const query: Query = {};
  if (view.sort !== "priority") query.sort = view.sort;
  if (view.dir !== "asc") query.dir = view.dir;
  return query;
}

function hrefWith(path: string, query: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

function withoutKey(query: Query, key: string): Query {
  const next = { ...query };
  delete next[key];
  return next;
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<CustomerListParams> }) {
  const actor = await getActor();
  const params = await searchParams;
  const options = await customerFilterOptions(actor.organizationId);
  const filters = customerListFilters(params, options.types, options.zones, options.cities, options.regions);
  const view = customerListView(params);
  const { typeChoices, zoneChoices, cityChoices, regionChoices, total } = options;
  const where = customerListWhere(actor.organizationId, filters);
  const db = getDb();
  const [found, statusCounts, points] = await Promise.all([
    db.customer.count({ where }),
    customerStatusCounts(actor.organizationId, filters),
    db.customer.findMany({
      where: { ...where, latitude: { not: null }, longitude: { not: null } },
      select: { id: true, name: true, venueType: true, district: true, latitude: true, longitude: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(found / CUSTOMER_PAGE_SIZE));
  const page = Math.min(view.page, pages);
  const customers = await db.customer.findMany({
    where,
    orderBy: customerOrderBy(view),
    skip: (page - 1) * CUSTOMER_PAGE_SIZE,
    take: CUSTOMER_PAGE_SIZE,
  });

  const filterParams = filterQuery(filters);
  const sortParams = viewQuery(view);
  const current = { ...filterParams, ...sortParams };
  const pageHref = (target: number) => hrefWith("/crm/customers", { ...current, page: target > 1 ? String(target) : "" });
  const sortLinks = Object.fromEntries(
    CUSTOMER_SORTS.map((key) => {
      const dir = view.sort === key && view.dir === "asc" ? "desc" : "asc";
      return [key, hrefWith("/crm/customers", { ...filterParams, ...viewQuery({ sort: key, dir, page: 1 }) })];
    }),
  ) as Record<CustomerSort, string>;

  const labelOf = (list: { value: string; label: string }[], value: string) => list.find((item) => item.value === value)?.label ?? value;
  const chipSource: { key: keyof CustomerListFilters; label: string }[] = [
    { key: "q", label: `„${filters.q}“` },
    { key: "type", label: filters.type },
    { key: "zone", label: filters.zone },
    { key: "city", label: filters.city },
    { key: "region", label: filters.region },
    { key: "priority", label: `პრიორიტეტი ${filters.priority}` },
    { key: "phone", label: `ტელეფონი: ${labelOf(PRESENCE, filters.phone)}` },
    { key: "web", label: `ვებგვერდი: ${labelOf(PRESENCE, filters.web)}` },
    { key: "verified", label: labelOf(VERIFIED, filters.verified) },
  ];
  const chips = chipSource
    .filter((chip) => filters[chip.key])
    .map((chip) => ({ ...chip, href: hrefWith("/crm/customers", { ...withoutKey(filterParams, chip.key), ...sortParams }) }));
  const panelCount = chips.filter((chip) => chip.key !== "q").length;
  const active = Object.values(filters).some(Boolean);
  const today = tbilisiDateString();
  const from = found === 0 ? 0 : (page - 1) * CUSTOMER_PAGE_SIZE + 1;
  const to = (page - 1) * CUSTOMER_PAGE_SIZE + customers.length;

  return (
    <section className="customer-page space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">კლიენტები</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {active ? `${found} ნაპოვნია, სულ ${total}` : `${total} ობიექტი`}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href={hrefWith("/export/customers", filterParams)}>Excel</Link>
          </Button>
          <Button asChild>
            <Link href="/crm/customers/new">ახალი კლიენტი</Link>
          </Button>
        </div>
      </div>

      <CustomerFilters
        filters={filters}
        keep={sortParams}
        activeCount={panelCount}
        groups={[
          {
            title: "ადგილი",
            fields: [
              { name: "type", label: "ტიპი", options: [{ value: "", label: "ყველა" }, ...typeChoices.map(placeOption)] },
              { name: "zone", label: "ზონა", options: [{ value: "", label: "ყველა" }, ...zoneChoices.map(placeOption)] },
              { name: "city", label: "ქალაქი", options: [{ value: "", label: "ყველა" }, ...cityChoices.map(placeOption)] },
              { name: "region", label: "რეგიონი", options: [{ value: "", label: "ყველა" }, ...regionChoices.map(placeOption)] },
            ],
          },
          {
            title: "გაყიდვა",
            fields: [{ name: "priority", label: "პრიორიტეტი", options: PRIORITY_FILTER }],
          },
          {
            title: "მონაცემი",
            fields: [
              { name: "phone", label: "ტელეფონი", options: PRESENCE },
              { name: "web", label: "ვებგვერდი", options: PRESENCE },
              { name: "verified", label: "ვერიფიკაცია", options: VERIFIED },
            ],
          },
        ]}
      />

      <nav className="customer-tabs" aria-label="სტატუსი">
        {STATUS_TABS.map((code) => {
          const count = code ? statusCounts.counts[code] ?? 0 : statusCounts.all;
          const on = filters.status === code;
          return (
            <Link
              key={code || "all"}
              href={hrefWith("/crm/customers", { ...withoutKey(filterParams, "status"), ...sortParams, status: code })}
              className={cn("customer-tab", on && "on")}
              aria-current={on ? "page" : undefined}
            >
              {code ? <span className="customer-tab-dot" style={{ background: RELATIONSHIP[code]?.color }} /> : null}
              <span>{code ? statusBadge(code).label : "ყველა"}</span>
              <span className="customer-tab-count">{count}</span>
            </Link>
          );
        })}
      </nav>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <Link key={chip.key} href={chip.href} className="customer-chip" aria-label={`${chip.label} — მოხსნა`}>
              <span>{chip.label}</span>
              <X size={14} />
            </Link>
          ))}
          <Link href={hrefWith("/crm/customers", sortParams)} className="text-sm font-medium text-brand-500 hover:text-brand-600">
            ყველას გასუფთავება
          </Link>
        </div>
      ) : null}

      {found === 0 ? (
        <Card className="grid justify-items-center gap-3 p-10 text-center">
          <p className="text-base font-medium text-gray-800 dark:text-white/90">{active ? "ამ ფილტრს არაფერი ემთხვევა" : "კლიენტი ჯერ არ არის"}</p>
          {active ? (
            <Button asChild variant="secondary">
              <Link href="/crm/customers">ფილტრების გასუფთავება</Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/crm/customers/new">ახალი კლიენტი</Link>
            </Button>
          )}
        </Card>
      ) : (
        <CustomerBoard
          key={JSON.stringify(filters)}
          rows={customers.map((customer) => {
            const status = statusBadge(customer.relationshipStatus);
            const next = customer.nextContactOn ? formatDateOnly(customer.nextContactOn) : "";
            const tel = primaryPhone(customer.phone || customer.phoneNormalized || "");
            return {
              id: customer.id,
              name: customer.name,
              type: customer.venueType || "",
              place: [customer.district, customer.city && customer.city !== customer.district ? customer.city : ""].filter(Boolean).join(" · "),
              phone: customer.phone || customer.phoneNormalized ? displayPhone(customer.phone, customer.phoneNormalized) : "",
              tel,
              status: status.label,
              statusTone: status.tone,
              priority: customer.priority && PRIORITY[customer.priority] ? customer.priority : "",
              priorityColor: customer.priority ? PRIORITY[customer.priority]?.color ?? "" : "",
              next: next ? formatGeorgianShortDate(next) : "",
              overdue: Boolean(next && next < today),
              mapped: customer.latitude != null && customer.longitude != null,
            };
          })}
          points={points.map((point) => ({
            id: point.id,
            name: point.name,
            type: point.venueType || "",
            zone: point.district || "",
            lat: Number(point.latitude),
            lng: Number(point.longitude),
          }))}
          found={found}
          from={from}
          to={to}
          prevHref={page > 1 ? pageHref(page - 1) : null}
          nextHref={page < pages ? pageHref(page + 1) : null}
          sort={view.sort}
          dir={view.dir}
          sortLinks={sortLinks}
        />
      )}
    </section>
  );
}
