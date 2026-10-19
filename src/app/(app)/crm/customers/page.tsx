import Link from "next/link";
import { ComboBox } from "@/components/combo-box";
import { RecordList } from "@/components/record-list";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { customerFilterOptions, customerListFilters, customerListWhere, type CustomerListFilters, type CustomerListParams } from "@/server/features/crm/customer-list";
import { PRIORITY, statusBadge, VERIFICATION } from "@/server/labels";
import { displayPhone } from "@/server/phone";

const STATUSES = [
  { value: "", label: "ყველა" },
  { value: "fresh", label: "ახალი" },
  { value: "to_contact", label: "უნდა დავაკონტაქტო" },
  { value: "quote_sent", label: "შეთავაზება გავაგზავნე" },
  { value: "customer", label: "მომხმარებელი გახდა" },
  { value: "declined", label: "არ სურს" },
];
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

function exportHref(filters: CustomerListFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/export/customers?${query}` : "/export/customers";
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<CustomerListParams> }) {
  const actor = await getActor();
  const params = await searchParams;
  const options = await customerFilterOptions(actor.organizationId);
  const filters = customerListFilters(params, options.types, options.zones);
  const { types, zones, total } = options;
  const customers = await getDb().customer.findMany({
    where: customerListWhere(actor.organizationId, filters),
    include: { addresses: { take: 1, orderBy: { line1: "asc" } } },
    orderBy: [{ priority: "asc" }, { name: "asc" }, { district: "asc" }],
  });
  const active = Object.values(filters).some(Boolean);
  return (
    <section className="grid">
      <div className="page-head">
        <div className="row">
          <h1>კლიენტები</h1>
          <div className="actions">
            <Link className="button secondary" href={exportHref(filters)}>Excel</Link>
            <Link className="button" href="/crm/customers/new">ახალი კლიენტი</Link>
          </div>
        </div>
        <p>{active ? `${customers.length} ნაჩვენებია, სულ ${total}` : `${total} ობიექტი`}</p>
      </div>
      <form className="filters" role="search" aria-label="კლიენტების ფილტრი">
        <label>ძებნა
          <input name="q" defaultValue={filters.q} placeholder="სახელი, ტელეფონი, მისამართი" />
        </label>
        <label>ტიპი
          <ComboBox name="type" options={[{ value: "", label: "ყველა" }, ...types.map((value) => ({ value, label: value }))]} defaultValue={filters.type} />
        </label>
        <label>ზონა
          <ComboBox name="zone" options={[{ value: "", label: "ყველა" }, ...zones.map((value) => ({ value, label: value }))]} defaultValue={filters.zone} />
        </label>
        <label>პრიორიტეტი
          <ComboBox name="priority" options={PRIORITY_FILTER} defaultValue={filters.priority} />
        </label>
        <label>სტატუსი
          <ComboBox name="status" options={STATUSES} defaultValue={filters.status} />
        </label>
        <label>ტელეფონი
          <ComboBox name="phone" options={PRESENCE} defaultValue={filters.phone} />
        </label>
        <label>ვებგვერდი
          <ComboBox name="web" options={PRESENCE} defaultValue={filters.web} />
        </label>
        <label>ვერიფიკაცია
          <ComboBox name="verified" options={VERIFIED} defaultValue={filters.verified} />
        </label>
        <div className="filter-actions">
          <button type="submit">ჩვენება</button>
          {active ? <Link className="button secondary" href="/crm/customers">გასუფთავება</Link> : null}
        </div>
      </form>
      <RecordList
        storageKey="customers"
        empty={active ? "ამ ფილტრს არაფერი ემთხვევა." : "კლიენტი ჯერ არ არის."}
        columns={[
          { key: "name", header: "ობიექტი" },
          { key: "type", header: "ტიპი" },
          { key: "zone", header: "ზონა" },
          { key: "priority", header: "პრიორიტეტი" },
          { key: "phone", header: "ტელეფონი" },
          { key: "status", header: "სტატუსი" },
          { key: "edit", header: "" },
        ]}
        rows={customers.map((customer) => {
          const badge = statusBadge(customer.relationshipStatus);
          const priority = customer.priority ? PRIORITY[customer.priority] : null;
          const verified = customer.verification ? VERIFICATION[customer.verification] : null;
          const address = customer.addresses[0]?.line1;
          return {
            id: customer.id,
            cells: {
              name: (
                <span className="who">
                  <Link href={`/crm/customers/${customer.id}`}>{customer.name}</Link>
                  {address ? <small>{address}</small> : null}
                </span>
              ),
              type: customer.venueType || "—",
              zone: customer.district || "—",
              priority: priority ? <span className="badge" title={priority.hint} style={{ background: priority.color, color: "white" }}>{priority.short}</span> : "—",
              phone: displayPhone(customer.phone, customer.phoneNormalized),
              status: (
                <span className="who">
                  <span className="badge" style={{ background: badge.color, color: "white" }}>{badge.label}</span>
                  {verified ? <small>{verified.label}</small> : null}
                </span>
              ),
              edit: <Link className="button secondary" href={`/crm/customers/${customer.id}/edit`}>რედაქტირება</Link>,
            },
          };
        })}
      />
    </section>
  );
}
