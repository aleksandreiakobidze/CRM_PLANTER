import Link from "next/link";
import { RecordList } from "@/components/record-list";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { excursionStatusLabel } from "@/server/labels";
import { D, moneyText } from "@/server/money";

export default async function ExcursionsPage() {
  const actor = await getActor();
  const bookings = await getDb().excursionBooking.findMany({
    where: { organizationId: actor.organizationId },
    include: { customer: true, program: true },
    orderBy: { startsAt: "desc" },
  });
  return (
    <section className="grid">
      <div className="row">
        <h1>ექსკურსიები</h1>
        <div className="actions">
          <Link className="button secondary" href="/export/excursions">Excel</Link>
          <Link className="button" href="/excursions/new">ჯავშანი</Link>
        </div>
      </div>
      <p>სტანდარტული ფანჯარია 10:00–17:00, თბილისის დროით.</p>
      <RecordList
        storageKey="excursion-bookings"
        empty="ჯგუფი ჯერ არ არის."
        columns={[
          { key: "number", header: "ნომერი" },
          { key: "customer", header: "კლიენტი" },
          { key: "note", header: "შენიშვნა" },
          { key: "price", header: "ფასი" },
          { key: "status", header: "სტატუსი" },
        ]}
        rows={bookings.map((booking) => ({
          id: booking.id,
          cells: {
            number: <Link href={`/excursions/${booking.id}`}>{booking.number}</Link>,
            customer: booking.customer.name,
            note: booking.note.trim() || booking.program?.nameKa || "",
            price: D(booking.price).gt(0) ? `${moneyText(D(booking.price))} ₾` : "",
            status: excursionStatusLabel(booking.status),
          },
        }))}
      />
    </section>
  );
}
