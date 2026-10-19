import Link from "next/link";
import { notFound } from "next/navigation";
import { convertQuoteAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { D } from "@/server/money";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const quote = await getDb().quote.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { lines: true, customer: true, order: true },
  });
  if (!quote) notFound();
  const total = quote.lines.reduce((sum, line) => sum.plus(D(line.lineTotal)), D(0));
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/sales/quotes">შეთავაზებები</Link>
        <h1>{quote.number}</h1>
        <p>{quote.customer.name} · {quote.status}</p>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>დასახელება</th><th>რაოდენობა</th><th>ფასი</th><th>ჯამი</th></tr></thead>
          <tbody>
            {quote.lines.map((line) => (
              <tr key={line.id}><td>{line.description}</td><td>{line.quantity.toString()}</td><td>{line.unitPrice.toString()}</td><td>{line.lineTotal.toString()}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="doc-total">ჯამი: {total.toFixed(2)} ₾</p>
      </div>
      <div className="actions">
        {quote.order ? <a className="button" href={`/sales/orders/${quote.order.id}`}>შეკვეთა {quote.order.number}</a> : (
          <form action={convertQuoteAction.bind(null, quote.id)}><button type="submit">შეკვეთად გარდაქმნა</button></form>
        )}
      </div>
    </section>
  );
}
