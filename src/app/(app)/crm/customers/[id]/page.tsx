import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { ComposePanel } from "@/components/compose-panel";
import { CustomerFields } from "@/components/customer-fields";
import { CustomerFilesTab } from "@/components/customer-files-tab";
import { DocTabs } from "@/components/doc-tabs";
import { RecordList } from "@/components/record-list";
import { TaskAssignForm } from "@/components/task-assign-form";
import { addActivityAction, addAddressAction, addContactAction, updateCustomerAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { externalHref, hostLabel, orderStatusLabel, PRIORITY, SEGMENT_LABEL, statusBadge, VERIFICATION } from "@/server/labels";
import { D } from "@/server/money";
import { displayPhone } from "@/server/phone";
import { formatDateOnly, tbilisiDateString } from "@/server/time";
import { loadInvoiceSources } from "@/server/features/finance/invoice-source";
import { listPlaceOptions, selectOptions } from "@/server/features/crm/place-terms";

const RESULTS = [
  { value: "no_answer", label: "ვერ დავუკავშირდი" },
  { value: "interested", label: "დაინტერესდა" },
  { value: "needs_time", label: "სჭირდება დრო" },
  { value: "refused", label: "უარი" },
];
const TASK_LABEL: Record<string, string> = { open: "გასაკეთებელი", doing: "მიმდინარე", done: "შესრულებული", cancelled: "გაუქმებული" };
const KIND_LABEL: Record<string, string> = { company: "კომპანია", person: "ფიზიკური პირი" };
const TABS = ["card", "contacts", "addresses", "calls", "tasks", "files", "history"] as const;
const HIST = ["quotes", "orders", "invoices"] as const;
type HistKind = (typeof HIST)[number];

function quoteStatusLabel(status: string) {
  if (status === "draft") return "ღია";
  if (status === "converted") return "შეკვეთად გადაკეთდა";
  return status;
}

function invoiceStatusLabel(status: string) {
  if (status === "draft") return "მონახაზი";
  if (status === "posted") return "გატარებული";
  return status;
}

function sumLines(lines: { lineTotal: { toString(): string } }[]) {
  return lines.reduce((sum, line) => sum.plus(D(line.lineTotal)), D(0));
}

const EMPTY_HIST: Record<HistKind, string> = {
  quotes: "შეთავაზება ჯერ არ არის.",
  orders: "შეკვეთა ჯერ არ არის.",
  invoices: "ინვოისი ჯერ არ არის.",
};

function HistoryList({
  kind,
  base,
  status,
  quotes,
  orders,
  invoices,
}: {
  kind: HistKind;
  base: string;
  status?: string;
  quotes: { id: string; number: string; status: string; createdAt: Date; lines: { lineTotal: { toString(): string } }[] }[];
  orders: { id: string; number: string; status: string; createdAt: Date; orderedOn: Date; lines: { lineTotal: { toString(): string } }[] }[];
  invoices: { id: string; number: string | null; status: string; createdAt: Date; total: { toString(): string }; source: { href: string; label: string } | null }[];
}) {
  const rows = kind === "quotes"
    ? quotes.map((quote) => ({
        id: quote.id,
        href: `/sales/quotes/${quote.id}`,
        number: quote.number,
        date: tbilisiDateString(quote.createdAt),
        status: quote.status,
        statusLabel: quoteStatusLabel(quote.status),
        total: sumLines(quote.lines),
        source: null,
      }))
    : kind === "orders"
      ? orders.map((order) => ({
          id: order.id,
          href: `/sales/orders/${order.id}`,
          number: order.number,
          date: formatDateOnly(order.orderedOn),
          status: order.status,
          statusLabel: orderStatusLabel(order.status),
          total: sumLines(order.lines),
          source: null,
        }))
      : invoices.map((invoice) => ({
          id: invoice.id,
          href: `/finance/invoices/${invoice.id}`,
          number: invoice.number ?? "მონახაზი",
          date: tbilisiDateString(invoice.createdAt),
          status: invoice.status,
          statusLabel: invoiceStatusLabel(invoice.status),
          total: D(invoice.total),
          source: invoice.source,
        }));
  const statuses = [...new Set(rows.map((row) => row.status))];
  const active = statuses.includes(status ?? "") ? status! : "";
  const visible = active ? rows.filter((row) => row.status === active) : rows;
  const total = visible.reduce((sum, row) => sum.plus(row.total), D(0));
  function statusHref(next: string) {
    const params = new URLSearchParams({ tab: "history", hist: kind });
    if (next) params.set("status", next);
    return `${base}?${params.toString()}`;
  }
  const labelFor = kind === "quotes" ? quoteStatusLabel : kind === "orders" ? orderStatusLabel : invoiceStatusLabel;
  return (
    <div className="hist-list">
      {rows.length > 0 ? (
        <nav className="hist-filters" aria-label="სტატუსის ფილტრი">
          <Link className="chip" href={statusHref("")} aria-current={active ? undefined : "page"}>ყველა</Link>
          {statuses.map((item) => (
            <Link key={item} className="chip" href={statusHref(item)} aria-current={active === item ? "page" : undefined}>{labelFor(item)}</Link>
          ))}
        </nav>
      ) : null}
      {rows.length === 0 ? <p className="muted">{EMPTY_HIST[kind]}</p> : null}
      {rows.length > 0 && visible.length === 0 ? <p className="muted">ამ ფილტრს არაფერი ემთხვევა.</p> : null}
      {visible.length > 0 ? (
        <table>
          <thead>
            <tr><th>ნომერი</th><th>თარიღი</th><th>სტატუსი</th><th>ჯამი</th></tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={row.href}>{row.number}</Link>
                  {row.source ? <> · <Link href={row.source.href}>{row.source.label}</Link></> : null}
                </td>
                <td>{row.date}</td>
                <td>{row.statusLabel}</td>
                <td>{row.total.toFixed(2)} ₾</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {rows.length > 0 ? <p className="doc-total">ჯამი: {total.toFixed(2)} ₾</p> : null}
    </div>
  );
}

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; hist?: string; status?: string }>;
}) {
  const actor = await getActor();
  const { id } = await params;
  const query = await searchParams;
  const requested = query.tab;
  const tab = TABS.includes(requested as (typeof TABS)[number]) ? requested! : "card";
  const hist: HistKind | null = tab === "history" && HIST.includes(query.hist as HistKind) ? (query.hist as HistKind) : null;
  const [customer, places] = await Promise.all([
    getDb().customer.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: {
        contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
        addresses: true,
        activities: { orderBy: { occurredAt: "desc" } },
        tasks: { orderBy: { dueOn: "asc" }, include: { assignments: { include: { user: true } } } },
        files: { orderBy: { createdAt: "desc" } },
      },
    }),
    listPlaceOptions(actor.organizationId),
  ]);
  if (!customer) notFound();
  const placeSelects = {
    venueTypes: selectOptions(places.venue_type),
    districts: selectOptions(places.district),
    cities: selectOptions(places.city),
    regions: selectOptions(places.region),
  };
  const members = actor.permissions.has("crm.write")
    ? await getDb().membership.findMany({
        where: { organizationId: actor.organizationId, active: true, user: { active: true } },
        include: { user: true },
        orderBy: { user: { name: "asc" } },
      })
    : [];
  const badge = statusBadge(customer.relationshipStatus);
  const priority = customer.priority ? PRIORITY[customer.priority] : null;
  const verified = customer.verification ? VERIFICATION[customer.verification] : null;
  const place = customer.addresses[0];
  const openTasks = customer.tasks.filter((task) => task.status === "open" || task.status === "doing").length;
  const kindLine = [KIND_LABEL[customer.kind] ?? customer.kind, customer.venueType || SEGMENT_LABEL[customer.segment] || customer.segment, customer.district].filter(Boolean).join(" · ");
  const phone = displayPhone(customer.phone, customer.phoneNormalized);
  const contactLine = [phone !== "—" ? phone : "", customer.email].filter(Boolean).join(" · ");
  const mapFallback = [customer.name, place?.line1, customer.city, "თბილისი"].filter(Boolean).join(", ");
  const base = `/crm/customers/${customer.id}`;
  const history = tab === "history"
    ? await Promise.all([
        getDb().quote.findMany({
          where: { customerId: customer.id, organizationId: actor.organizationId },
          include: { lines: true },
          orderBy: { createdAt: "desc" },
        }),
        getDb().salesOrder.findMany({
          where: { customerId: customer.id, organizationId: actor.organizationId },
          include: { lines: true },
          orderBy: { createdAt: "desc" },
        }),
        getDb().invoice.findMany({
          where: { customerId: customer.id, organizationId: actor.organizationId },
          include: { order: true },
          orderBy: { createdAt: "desc" },
        }),
      ])
    : null;
  const quotes = history?.[0] ?? [];
  const orders = history?.[1] ?? [];
  const invoices = history?.[2] ?? [];
  const invoiceSources = invoices.length > 0 ? await loadInvoiceSources(actor.organizationId, invoices) : new Map<string, { href: string; label: string }>();
  const tabs = [
    { id: "card", label: "ბარათი", href: base },
    { id: "contacts", label: "კონტაქტები", href: `${base}?tab=contacts` },
    { id: "addresses", label: "მისამართები", href: `${base}?tab=addresses` },
    { id: "calls", label: "ზარები", href: `${base}?tab=calls` },
    { id: "tasks", label: "დავალებები", href: `${base}?tab=tasks` },
    { id: "files", label: "ფაილები", href: `${base}?tab=files` },
    { id: "history", label: "ისტორია", href: `${base}?tab=history` },
  ];
  return (
    <section className="grid doc">
      <div className="doc-head">
        <div className="page-head">
          <Link className="back" href="/crm/customers">კლიენტები</Link>
          <h1>{customer.name}</h1>
          <p className="muted">{kindLine}</p>
          {contactLine ? <p>{contactLine}</p> : null}
        </div>
        <div className="kpis">
          <span className="badge" style={{ background: badge.color, color: "white" }}>{badge.label}</span>
          {priority ? <span className="badge" title={priority.hint} style={{ background: priority.color, color: "white" }}>{priority.label}</span> : null}
          {verified ? <span className="badge" style={{ background: verified.color, color: "white" }}>{verified.label}</span> : null}
          {customer.doNotContact ? <span className="badge warn-badge">აღარ დამიკავშირდეთ</span> : null}
        </div>
      </div>
      <DocTabs label="კლიენტის ტაბები" tabs={tabs} current={tab} />

      {tab === "card" ? (
        <div className="card doc-card">
          <BoundForm action={updateCustomerAction.bind(null, customer.id)} label="შენახვა">
            <CustomerFields
              placeName={customer.name}
              mapFallback={mapFallback}
              addressHint
              showDoNotContact
              places={placeSelects}
              values={{
                kind: customer.kind,
                name: customer.name,
                legalName: customer.legalName ?? "",
                directorName: customer.directorName ?? "",
                venueType: customer.venueType ?? "",
                segment: customer.segment,
                identificationCode: customer.identificationCode ?? "",
                district: customer.district ?? "",
                city: customer.city ?? "",
                region: customer.region ?? "",
                phone: customer.phone ?? "",
                email: customer.email ?? "",
                website: customer.website ?? "",
                mapsUrl: customer.mapsUrl ?? "",
                source: customer.source ?? "",
                priority: customer.priority ?? "",
                verification: customer.verification ?? "",
                relationshipStatus: customer.relationshipStatus,
                nextContactOn: customer.nextContactOn ? formatDateOnly(customer.nextContactOn) : "",
                notes: customer.notes ?? "",
                doNotContact: customer.doNotContact,
              }}
            />
          </BoundForm>
          <div className="fact-row">
            <p><small>საიდენტიფიკაციო</small>{customer.identificationCode || "—"}</p>
            <p><small>მისამართი</small>{place?.line1 || "—"}</p>
            <p><small>ვებგვერდი</small>{customer.website ? <a href={externalHref(customer.website)} target="_blank" rel="noreferrer">{hostLabel(customer.website)}</a> : "—"}</p>
            <p><small>წყარო</small>{customer.source ? <a href={externalHref(customer.source)} target="_blank" rel="noreferrer">{hostLabel(customer.source)}</a> : "—"}</p>
            <p><small>შემდეგი კონტაქტი</small>{customer.nextContactOn ? formatDateOnly(customer.nextContactOn) : "—"}</p>
          </div>
        </div>
      ) : null}

      {tab === "contacts" ? (
        <div className="card doc-card tasks-panel">
          <div>
            <h2 className="doc-title">კონტაქტები</h2>
          </div>
          <ComposePanel
            buttonLabel="ახალი კონტაქტი"
            submitLabel="შენახვა"
            action={addContactAction.bind(null, customer.id)}
          >
            <label>სახელი<input name="name" required autoFocus /></label>
            <label>თანამდებობა<input name="title" /></label>
            <label>ტელეფონი<input name="phone" /></label>
            <label>ელფოსტა<input name="email" type="email" /></label>
            <label><input name="isPrimary" type="checkbox" value="yes" /> მთავარი კონტაქტი</label>
          </ComposePanel>
          <RecordList
            storageKey={`customer-${customer.id}-contacts`}
            empty="კონტაქტი ჯერ არ არის."
            columns={[
              { key: "name", header: "სახელი" },
              { key: "title", header: "თანამდებობა" },
              { key: "phone", header: "ტელეფონი" },
              { key: "email", header: "ელფოსტა" },
              { key: "primary", header: "" },
            ]}
            rows={customer.contacts.map((contact) => ({
              id: contact.id,
              cells: {
                name: contact.name,
                title: contact.title || "—",
                phone: contact.phoneNormalized || contact.phone || "—",
                email: contact.email || "—",
                primary: contact.isPrimary ? <span className="badge ok-badge">მთავარი</span> : "—",
              },
            }))}
          />
        </div>
      ) : null}

      {tab === "addresses" ? (
        <div className="card doc-card tasks-panel">
          <div>
            <h2 className="doc-title">მისამართები</h2>
          </div>
          <ComposePanel
            buttonLabel="ახალი მისამართი"
            submitLabel="შენახვა"
            action={addAddressAction.bind(null, customer.id)}
          >
            <label>იარლიყი<input name="label" defaultValue="მთავარი" /></label>
            <label>ქუჩა<input name="line1" required autoFocus /></label>
            <label>ქალაქი<ComboBox name="city" allowCreate options={placeSelects.cities} placeholder="არჩევა ან დამატება" /></label>
            <label>რეგიონი<ComboBox name="region" allowCreate options={placeSelects.regions} placeholder="არჩევა ან დამატება" /></label>
            <label>უბანი<ComboBox name="district" allowCreate options={placeSelects.districts} placeholder="არჩევა ან დამატება" /></label>
          </ComposePanel>
          <RecordList
            storageKey={`customer-${customer.id}-addresses`}
            empty="მისამართი ჯერ არ არის."
            columns={[{ key: "label", header: "იარლიყი" }, { key: "line", header: "მისამართი" }]}
            rows={customer.addresses.map((address) => ({
              id: address.id,
              cells: {
                label: address.label,
                line: [address.line1, address.city, address.region, address.district].filter(Boolean).join(", "),
              },
            }))}
          />
        </div>
      ) : null}

      {tab === "calls" ? (
        <div className="card doc-card tasks-panel">
          <div>
            <h2 className="doc-title">ზარები</h2>
          </div>
          <ComposePanel
            buttonLabel="ახალი ზარი"
            submitLabel="შენახვა"
            action={addActivityAction.bind(null, customer.id)}
          >
            <label>შედეგი<ComboBox name="result" options={RESULTS} defaultValue="no_answer" /></label>
            <label>ტექსტი<textarea name="body" required /></label>
          </ComposePanel>
          <RecordList
            storageKey={`customer-${customer.id}-calls`}
            empty="ზარი ჯერ არ არის."
            columns={[{ key: "result", header: "შედეგი" }, { key: "body", header: "ტექსტი" }]}
            rows={customer.activities.map((activity) => ({
              id: activity.id,
              cells: {
                result: RESULTS.find((item) => item.value === activity.result)?.label ?? activity.result,
                body: activity.body,
              },
            }))}
          />
        </div>
      ) : null}

      {tab === "tasks" ? (
        <div className="card doc-card tasks-panel">
          <div>
            <h2 className="doc-title">დავალებები</h2>
            <p className="muted">{openTasks} ღია</p>
          </div>
          <TaskAssignForm
            actorId={actor.userId}
            customerId={customer.id}
            members={members.map((member) => ({ id: member.userId, name: member.user.name }))}
          />
          <RecordList
            storageKey={`customer-${customer.id}-tasks`}
            empty="დავალება ჯერ არ არის."
            columns={[
              { key: "title", header: "სათაური" },
              { key: "people", header: "შემსრულებლები" },
              { key: "status", header: "სტატუსი" },
              { key: "due", header: "ვადა" },
            ]}
            rows={customer.tasks.map((task) => ({
              id: task.id,
              cells: {
                title: <Link href={`/work/${task.id}`}>{task.title}</Link>,
                people: task.assignments.map((item) => `${item.user.name}${item.status === "done" ? " · შესრულებული" : ""}`).join(", ") || "—",
                status: TASK_LABEL[task.status] ?? task.status,
                due: task.dueOn ? formatDateOnly(task.dueOn) : "ვადის გარეშე",
              },
            }))}
          />
        </div>
      ) : null}

      {tab === "files" ? (
        <CustomerFilesTab
          customerId={customer.id}
          canWrite={actor.permissions.has("crm.write")}
          files={customer.files}
        />
      ) : null}

      {tab === "history" ? (
        <div className="card doc-card">
          <h2 className="doc-title">გაყიდვის ისტორია</h2>
          <div className="hist-cards">
            {([
              ["quotes", "შეთავაზება", quotes.length],
              ["orders", "შეკვეთა", orders.length],
              ["invoices", "ინვოისი", invoices.length],
            ] as const).map(([kind, label, count]) => (
              <Link key={kind} className="hist-card" href={hist === kind ? `${base}?tab=history` : `${base}?tab=history&hist=${kind}`} aria-current={hist === kind ? "page" : undefined}>
                <small>{label}</small>
                <strong>{count}</strong>
              </Link>
            ))}
          </div>
          {hist ? <HistoryList kind={hist} base={base} status={query.status} quotes={quotes} orders={orders} invoices={invoices.map((invoice) => ({ ...invoice, source: invoiceSources.get(invoice.id) ?? null }))} /> : null}
        </div>
      ) : null}
    </section>
  );
}
