import Link from "next/link";
import { notFound } from "next/navigation";
import { deliverRentalAction, returnRentalAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function RentalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const booking = await getDb().rentalBooking.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { lines: { include: { asset: true } }, customer: true, deposits: true },
  });
  if (!booking) notFound();
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/rental">გაქირავება</Link>
        <h1>{booking.number}</h1>
        <p>{booking.customer.name} · {booking.billingDays} დღე · {booking.total.toString()} ₾ · დეპოზიტი {booking.depositAmount.toString()} ₾</p>
      </div>
      <div className="card">
        <p>სტატუსი: {booking.status}</p>
        {booking.status === "confirmed" ? <form action={deliverRentalAction.bind(null, booking.id)}><button type="submit">გაცემა</button></form> : null}
        <ul>
          {booking.lines.map((line) => (
            <li key={line.id}>
              {line.asset.code} · {line.asset.status}
              {line.asset.status === "on_rent" ? (
                <span className="row">
                  <form action={returnRentalAction.bind(null, booking.id, line.assetId, "healthy")}><button type="submit">ჯანმრთელი დაბრუნება</button></form>
                  <form action={returnRentalAction.bind(null, booking.id, line.assetId, "damaged")}><button className="secondary" type="submit">დაზიანებული</button></form>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
