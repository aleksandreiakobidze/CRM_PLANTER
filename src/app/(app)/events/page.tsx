import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { RecordList } from "@/components/record-list";
import { bookEventAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { formatInTimeZone } from "date-fns-tz";
import { BUSINESS_TIME_ZONE, tbilisiDateString } from "@/server/time";

export default async function EventsPage() {
  const actor = await getActor();
  const [events, customers, resources, users] = await Promise.all([
    getDb().eventBooking.findMany({
      where: { organizationId: actor.organizationId },
      include: { resource: true, customer: true },
      orderBy: { startsAt: "desc" },
    }),
    getDb().customer.findMany({ where: { organizationId: actor.organizationId, mergedIntoId: null }, orderBy: { name: "asc" } }),
    getDb().resource.findMany({ where: { organizationId: actor.organizationId } }),
    getDb().user.findMany({
      where: { memberships: { some: { organizationId: actor.organizationId, active: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <section className="grid">
      <div className="page-head">
        <h1>სხვა ღონისძიება</h1>
        <p>იგივე სივრცის კალენდარი, რაც ექსკურსიას. სპონსორი და ბილეტი ცალკე ტიპია, არ ერევა გაყიდვას.</p>
      </div>
      <div className="card">
        <BoundForm action={bookEventAction} label="ჩაწერა">
          <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
          <label>სახელი<input name="name" required /></label>
          <label>კლიენტი
            <ComboBox name="customerId" options={[{ value: "", label: "—" }, ...customers.map((item) => ({ value: item.id, label: item.name }))]} />
          </label>
          <label>სივრცე
            <ComboBox name="resourceId" required options={resources.map((item) => ({ value: item.id, label: item.nameKa }))} />
          </label>
          <label>თარიღი<input name="date" type="date" required defaultValue={tbilisiDateString()} /></label>
          <label>დაწყება<input name="startTime" defaultValue="13:00" /></label>
          <label>დასრულება<input name="endTime" defaultValue="16:00" /></label>
          <label>სტუმარი<input name="guestCount" defaultValue="0" /></label>
          <label>ბიუჯეტი<input name="budgetAmount" defaultValue="0" /></label>
          <label>სპონსორი<input name="sponsorAmount" defaultValue="0" /></label>
          <label>ბილეთი<input name="ticketAmount" defaultValue="0" /></label>
          {users.length > 0 ? (
            <label>თანამშრომელი
              <ComboBox name="staffUserId" options={[{ value: "", label: "—" }, ...users.map((item) => ({ value: item.id, label: item.name }))]} />
            </label>
          ) : null}
        </BoundForm>
      </div>
      <RecordList
        storageKey="events"
        empty="ღონისძიება ჯერ არ არის."
        columns={[
          { key: "number", header: "ნომერი" },
          { key: "name", header: "სახელი" },
          { key: "when", header: "დრო" },
          { key: "space", header: "სივრცე" },
        ]}
        rows={events.map((event) => ({
          id: event.id,
          cells: {
            number: event.number,
            name: event.name,
            when: formatInTimeZone(event.startsAt, BUSINESS_TIME_ZONE, "yyyy-MM-dd HH:mm"),
            space: event.resource.nameKa,
          },
        }))}
      />
    </section>
  );
}
