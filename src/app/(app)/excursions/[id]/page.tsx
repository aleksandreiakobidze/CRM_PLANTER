import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { BoundForm } from "@/components/bound-form";
import { cancelExcursionAction, completeExcursionAction, rescheduleExcursionAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { excursionStatusLabel } from "@/server/labels";
import { D, moneyText } from "@/server/money";
import { BUSINESS_TIME_ZONE } from "@/server/time";

export default async function ExcursionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const booking = await getDb().excursionBooking.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { materials: true, customer: true, program: true },
  });
  if (!booking) notFound();
  const label = booking.note.trim() || booking.program?.nameKa || "ექსკურსია";
  const price = D(booking.price).gt(0)
    ? `${moneyText(D(booking.price))} ₾`
    : booking.program
      ? `${moneyText(D(booking.program.pricePerChild))} ₾ ბავშვზე`
      : "";
  const open = booking.status !== "completed" && booking.status !== "cancelled";
  const date = formatInTimeZone(booking.startsAt, BUSINESS_TIME_ZONE, "yyyy-MM-dd");
  const startTime = formatInTimeZone(booking.startsAt, BUSINESS_TIME_ZONE, "HH:mm");
  const endTime = formatInTimeZone(booking.endsAt, BUSINESS_TIME_ZONE, "HH:mm");
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/excursions">ექსკურსიები</Link>
        <h1>{booking.number}</h1>
        <p>{booking.customer.name} · {label}{price ? ` · ${price}` : ""} · {date} {startTime}–{endTime} · დაგეგმილი {booking.plannedChildren} · {excursionStatusLabel(booking.status)}</p>
      </div>
      <div className="card">
        {booking.materials.length > 0 ? (
          <ul>{booking.materials.map((material) => <li key={material.id}>დაჯავშნილი {material.reserved.toString()} · მოხმარებული {material.consumed.toString()}</li>)}</ul>
        ) : null}
        {open ? (
          <>
            <BoundForm action={rescheduleExcursionAction} label="შენახვა">
              <input type="hidden" name="bookingId" value={booking.id} />
              <label>თარიღი<input name="date" type="date" required defaultValue={date} /></label>
              <label>დაწყება<input name="startTime" defaultValue={startTime} /></label>
              <label>დასრულება<input name="endTime" defaultValue={endTime} /></label>
            </BoundForm>
            <BoundForm action={completeExcursionAction.bind(null, booking.id)} label="დასრულება">
              <label>დასწრებული ბავშვები<input name="attended" required defaultValue={String(booking.plannedChildren)} /></label>
            </BoundForm>
            <form action={cancelExcursionAction.bind(null, booking.id)}>
              <button className="secondary" type="submit">გაუქმება</button>
            </form>
          </>
        ) : booking.status === "cancelled" ? (
          <p>გაუქმებულია.</p>
        ) : (
          <p className="ok">დასრულებულია. დასარიცხი: {booking.billableChildren}</p>
        )}
      </div>
    </section>
  );
}
