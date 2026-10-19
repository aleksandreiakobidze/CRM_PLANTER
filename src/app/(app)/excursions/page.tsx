import Link from "next/link";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { RecordList } from "@/components/record-list";
import { createProgramAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function ExcursionsPage() {
  const actor = await getActor();
  const [programs, bookings, variants] = await Promise.all([
    getDb().excursionProgram.findMany({ where: { organizationId: actor.organizationId } }),
    getDb().excursionBooking.findMany({ where: { organizationId: actor.organizationId }, include: { customer: true, program: true } }),
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId } }),
  ]);
  return (
    <section className="grid">
      <div className="row">
        <h1>ექსკურსიები</h1>
        <div className="actions">
          <Link className="button secondary" href="/export/excursions">Excel</Link>
          <Link className="button" href="/excursions/new">ჯავშანი</Link>
        </div>
      </div>
      <p>სტანდარტული ფანჯარია 13:00–16:00, თბილისის დროით.</p>
      <div className="card">
        <BoundForm action={createProgramAction} label="პროგრამის შენახვა">
          <label>სახელი<input name="nameKa" required defaultValue="სათბურის ვიზიტი" /></label>
          <label>წუთი<input name="durationMinutes" defaultValue="120" /></label>
          <label>ფასი ბავშვზე<input name="pricePerChild" defaultValue="25" /></label>
          <label>ტევადობა<input name="maxCapacity" defaultValue="25" /></label>
          <label>მასალა<ComboBox name="variantId" options={variants.map((variant) => ({ value: variant.id, label: variant.sku }))} /></label>
        </BoundForm>
      </div>
      <RecordList
        storageKey="excursion-programs"
        empty="პროგრამა ჯერ არ არის."
        columns={[{ key: "name", header: "პროგრამა" }, { key: "window", header: "ფანჯარა" }]}
        rows={programs.map((program) => ({ id: program.id, cells: { name: program.nameKa, window: `${program.windowStart}–${program.windowEnd}` } }))}
      />
      <RecordList
        storageKey="excursion-bookings"
        empty="ჯგუფი ჯერ არ არის."
        columns={[{ key: "number", header: "ნომერი" }, { key: "customer", header: "კლიენტი" }, { key: "status", header: "სტატუსი" }]}
        rows={bookings.map((booking) => ({
          id: booking.id,
          cells: {
            number: <Link href={`/excursions/${booking.id}`}>{booking.number}</Link>,
            customer: booking.customer.name,
            status: booking.status,
          },
        }))}
      />
    </section>
  );
}
