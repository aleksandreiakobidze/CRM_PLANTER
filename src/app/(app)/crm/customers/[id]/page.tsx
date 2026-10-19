import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { Fold } from "@/components/fold";
import { mapsQuery, PlaceMap, mapOpenHref } from "@/components/place-map";
import { RecordList } from "@/components/record-list";
import { TaskAssignForm } from "@/components/task-assign-form";
import { addActivityAction, addAddressAction, addContactAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { externalHref, hostLabel, PRIORITY, SEGMENT_LABEL, statusBadge, VERIFICATION } from "@/server/labels";
import { displayPhone } from "@/server/phone";
import { formatDateOnly } from "@/server/time";

const RESULTS = [
  { value: "no_answer", label: "ვერ დავუკავშირდი" },
  { value: "interested", label: "დაინტერესდა" },
  { value: "needs_time", label: "სჭირდება დრო" },
  { value: "refused", label: "უარი" },
];
const TASK_LABEL: Record<string, string> = { open: "გასაკეთებელი", doing: "მიმდინარე", done: "შესრულებული", cancelled: "გაუქმებული" };
const KIND_LABEL: Record<string, string> = { company: "კომპანია", person: "ფიზიკური პირი" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const customer = await getDb().customer.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      addresses: true,
      activities: { orderBy: { occurredAt: "desc" } },
      quotes: true,
      orders: true,
      invoices: true,
      tasks: { orderBy: { dueOn: "asc" }, include: { assignments: { include: { user: true } } } },
    },
  });
  if (!customer) notFound();
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
  const mapQuery = mapsQuery(customer.mapsUrl, [customer.name, place?.line1, customer.city, "თბილისი"].filter(Boolean).join(", "));
  return (
    <section className="grid">
      <article className="card profile">
        <div className="profile-top">
          <div>
            <p className="muted">{kindLine}</p>
            <h1>{customer.name}</h1>
            <div className="kpis">
              <span className="badge" style={{ background: badge.color, color: "white" }}>{badge.label}</span>
              {priority ? <span className="badge" title={priority.hint} style={{ background: priority.color, color: "white" }}>{priority.label}</span> : null}
              {verified ? <span className="badge" style={{ background: verified.color, color: "white" }}>{verified.label}</span> : null}
              {customer.doNotContact ? <span className="badge warn-badge">აღარ დამიკავშირდეთ</span> : null}
            </div>
            {priority ? <p className="muted">{priority.hint}</p> : null}
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Link className="button" href={`/crm/customers/${customer.id}/edit`}>რედაქტირება</Link>
            <Link className="button secondary" href="/work">დაფა</Link>
          </div>
        </div>
        <div className="fact-row">
          <p><small>ტელეფონი</small>{displayPhone(customer.phone, customer.phoneNormalized)}</p>
          <p><small>ელფოსტა</small>{customer.email || "—"}</p>
          <p><small>ზონა</small>{customer.district || "—"}</p>
          <p><small>მისამართი</small>{place?.line1 || "—"}</p>
          <p><small>ქალაქი</small>{[customer.city, customer.region].filter(Boolean).join(", ") || "—"}</p>
          <p><small>ვებგვერდი</small>{customer.website ? <a href={externalHref(customer.website)} target="_blank" rel="noreferrer">{hostLabel(customer.website)}</a> : "—"}</p>
          <p><small>წყარო</small>{customer.source ? <a href={externalHref(customer.source)} target="_blank" rel="noreferrer">{hostLabel(customer.source)}</a> : "—"}</p>
          <p><small>საიდენტიფიკაციო</small>{customer.identificationCode || "—"}</p>
          <p><small>შემდეგი კონტაქტი</small>{customer.nextContactOn ? formatDateOnly(customer.nextContactOn) : "—"}</p>
        </div>
        {customer.notes ? <p className="note">{customer.notes}</p> : null}
        {mapQuery ? <PlaceMap name={customer.name} query={mapQuery} openHref={mapOpenHref(customer.mapsUrl, mapQuery)} /> : null}
      </article>

      <Fold id={`customer-${customer.id}-contacts`} title="კონტაქტები" hint={String(customer.contacts.length)}>
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
              primary: contact.isPrimary ? <span className="badge" style={{ background: "#166534", color: "white" }}>მთავარი</span> : "—",
            },
          }))}
        />
        <Fold id={`customer-${customer.id}-contact-form`} title="კონტაქტის დამატება" defaultOpen={customer.contacts.length === 0}>
          <BoundForm action={addContactAction.bind(null, customer.id)} label="კონტაქტის დამატება">
            <label>სახელი<input name="name" required /></label>
            <label>თანამდებობა<input name="title" /></label>
            <label>ტელეფონი<input name="phone" /></label>
            <label>ელფოსტა<input name="email" type="email" /></label>
            <label><input name="isPrimary" type="checkbox" value="yes" /> მთავარი კონტაქტი</label>
          </BoundForm>
        </Fold>
      </Fold>

      <Fold id={`customer-${customer.id}-addresses`} title="მისამართები" hint={String(customer.addresses.length)} defaultOpen={customer.addresses.length > 0}>
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
        <Fold id={`customer-${customer.id}-address-form`} title="მისამართის დამატება" defaultOpen={customer.addresses.length === 0}>
          <BoundForm action={addAddressAction.bind(null, customer.id)} label="მისამართის დამატება">
            <label>იარლიყი<input name="label" defaultValue="მთავარი" /></label>
            <label>ქუჩა<input name="line1" required /></label>
            <label>ქალაქი<input name="city" /></label>
            <label>რეგიონი<input name="region" /></label>
            <label>უბანი<input name="district" /></label>
          </BoundForm>
        </Fold>
      </Fold>

      <Fold id={`customer-${customer.id}-calls`} title="ზარები" hint={String(customer.activities.length)} defaultOpen={customer.activities.length > 0}>
        <Fold id={`customer-${customer.id}-call-form`} title="ზარის ჩაწერა" defaultOpen={customer.activities.length === 0}>
          <BoundForm action={addActivityAction.bind(null, customer.id)} label="ზარის ჩაწერა">
            <label>შედეგი<ComboBox name="result" options={RESULTS} defaultValue="no_answer" /></label>
            <label>ტექსტი<textarea name="body" required /></label>
          </BoundForm>
        </Fold>
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
      </Fold>

      <Fold id={`customer-${customer.id}-tasks`} title="დავალებები" hint={`${openTasks} ღია`}>
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
              title: task.title,
              people: task.assignments.map((item) => `${item.user.name}${item.status === "done" ? " · შესრულებული" : ""}`).join(", ") || "—",
              status: TASK_LABEL[task.status] ?? task.status,
              due: task.dueOn ? formatDateOnly(task.dueOn) : "ვადის გარეშე",
            },
          }))}
        />
        {members.length > 0 ? (
          <Fold id={`customer-${customer.id}-task-form`} title="დავალების მიცემა" defaultOpen={false}>
            <TaskAssignForm
              actorId={actor.userId}
              customerId={customer.id}
              members={members.map((member) => ({ id: member.userId, name: member.user.name }))}
            />
          </Fold>
        ) : null}
      </Fold>

      <Fold id={`customer-${customer.id}-history`} title="გაყიდვის ისტორია" defaultOpen={false} hint={`${customer.quotes.length + customer.orders.length + customer.invoices.length}`}>
        <div className="fact-row">
          <p><small>შეთავაზება</small><strong>{customer.quotes.length}</strong></p>
          <p><small>შეკვეთა</small><strong>{customer.orders.length}</strong></p>
          <p><small>ინვოისი</small><strong>{customer.invoices.length}</strong></p>
        </div>
        <div className="row" style={{ justifyContent: "flex-start" }}>
          <Link className="button secondary" href="/sales/quotes">შეთავაზებები</Link>
          <Link className="button secondary" href="/finance/invoices">ინვოისები</Link>
        </div>
      </Fold>
    </section>
  );
}
