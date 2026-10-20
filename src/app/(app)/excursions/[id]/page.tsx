import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { completeExcursionAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { D, moneyText } from "@/server/money";

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
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/excursions">ექსკურსიები</Link>
        <h1>{booking.number}</h1>
        <p>{booking.customer.name} · {label}{price ? ` · ${price}` : ""} · დაგეგმილი {booking.plannedChildren}</p>
      </div>
      <div className="card">
        {booking.materials.length > 0 ? (
          <ul>{booking.materials.map((material) => <li key={material.id}>დაჯავშნილი {material.reserved.toString()} · მოხმარებული {material.consumed.toString()}</li>)}</ul>
        ) : null}
        {booking.status !== "completed" ? (
          <BoundForm action={completeExcursionAction.bind(null, booking.id)} label="დასრულება">
            <label>დასწრებული ბავშვები<input name="attended" required defaultValue={String(booking.plannedChildren)} /></label>
          </BoundForm>
        ) : <p className="ok">დასრულებულია. დასარიცხი: {booking.billableChildren}</p>}
      </div>
    </section>
  );
}
