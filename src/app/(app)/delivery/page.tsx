import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { RecordList } from "@/components/record-list";
import { customerOption } from "@/lib/customer-option";
import { createDeliveryAction, deliveryStatusAction, saveRouteAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { listDriverDay } from "@/server/features/delivery/delivery-service";
import { tbilisiDateString } from "@/server/time";

const STATUS: Record<string, string> = {
  planned: "დასაგეგმი",
  scheduled: "დაგეგმილი",
  in_transit: "გზაში",
  done: "დასრულებული",
  failed: "ჩავარდნილი",
};

export default async function DeliveryPage() {
  const actor = await getActor();
  const today = tbilisiDateString();
  const write = can(actor, "delivery.write");
  const [day, customers, users] = await Promise.all([
    listDriverDay(actor, today),
    write
      ? getDb().customer.findMany({ where: { organizationId: actor.organizationId, mergedIntoId: null }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    write
      ? getDb().user.findMany({
          where: { memberships: { some: { organizationId: actor.organizationId, active: true } } },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const stops = day.routes.flatMap((route) => route.stops);
  return (
    <section className="grid">
      <div className="page-head">
        <h1>მიწოდება</h1>
        <p>მისამართი, ტელეფონი, რაოდენობა და ინსტრუქცია. {day.hideCost ? "თვითღირებულება ამ როლს არ უჩანს." : "დრო და მანძილი რუკის გარეშე არ იწერება."}</p>
      </div>
      {write ? (
        <div className="card">
          <h2>ახალი დავალება</h2>
          <BoundForm action={createDeliveryAction} label="შენახვა">
            <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
            <label>წყარო
              <ComboBox
                name="sourceType"
                options={[
                  { value: "order", label: "შეკვეთა" },
                  { value: "rental", label: "გაქირავება" },
                  { value: "replacement", label: "ჩანაცვლება" },
                  { value: "project", label: "პროექტი" },
                ]}
              />
            </label>
            <label>წყაროს ID<input name="sourceId" required /></label>
            <label>კლიენტი
              <ComboBox name="customerId" options={[{ value: "", label: "—" }, ...customers.map(customerOption)]} />
            </label>
            <label>მისამართი<input name="address" required /></label>
            <label>ტელეფონი<input name="phone" /></label>
            <label>რუკა<input name="mapsUrl" /></label>
            <label>რაოდენობა<input name="quantityNote" /></label>
            <label>ინსტრუქცია<textarea name="instructions" /></label>
          </BoundForm>
        </div>
      ) : null}
      {write ? (
        <div className="card">
          <h2>დღიური მარშრუტი</h2>
          <BoundForm action={saveRouteAction} label="მარშრუტის შენახვა">
            <input type="hidden" name="postingKey" value={`route:${actor.organizationId}:${today}`} />
            <label>თარიღი<input name="date" type="date" required defaultValue={today} /></label>
            <label>მძღოლი
              <ComboBox name="driverId" options={[{ value: "", label: "—" }, ...users.map((item) => ({ value: item.id, label: item.name }))]} />
            </label>
            {day.unassigned.map((task) => (
              <label key={task.id}>
                <input type="checkbox" name="taskId" value={task.id} /> {task.number} · {task.address}
              </label>
            ))}
          </BoundForm>
        </div>
      ) : null}
      <RecordList
        storageKey="delivery"
        empty="დღეს გაჩერება არ არის."
        columns={[
          { key: "number", header: "ნომერი" },
          { key: "customer", header: "კლიენტი" },
          { key: "address", header: "მისამართი" },
          { key: "phone", header: "ტელეფონი" },
          { key: "qty", header: "რაოდენობა" },
          { key: "status", header: "სტატუსი" },
          { key: "maps", header: "რუკა" },
        ]}
        rows={stops.map((stop) => ({
          id: stop.id,
          cells: {
            number: stop.number,
            customer: stop.customer,
            address: stop.address,
            phone: stop.phone ?? "—",
            qty: stop.quantityNote ?? "—",
            status: (
              <form action={deliveryStatusAction.bind(null, stop.id, stop.status === "in_transit" ? "done" : "in_transit")}>
                <button className="secondary" type="submit">{STATUS[stop.status] ?? stop.status}</button>
              </form>
            ),
            maps: stop.mapsUrl ? <a href={stop.mapsUrl} target="_blank" rel="noreferrer">რუკა</a> : "—",
          },
        }))}
      />
      {write && day.unassigned.length > 0 ? (
        <RecordList
          storageKey="delivery-unassigned"
          empty=""
          columns={[
            { key: "number", header: "დასაგეგმი" },
            { key: "address", header: "მისამართი" },
            { key: "phone", header: "ტელეფონი" },
          ]}
          rows={day.unassigned.map((task) => ({
            id: task.id,
            cells: { number: task.number, address: task.address, phone: task.phone ?? "—" },
          }))}
        />
      ) : null}
    </section>
  );
}
