import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelOrderAction, confirmOrderAction, fulfillOrderAction, invoiceOrderAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const order = await getDb().salesOrder.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { lines: true, customer: true, invoices: true },
  });
  if (!order) notFound();
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/sales/quotes">შეთავაზებები</Link>
        <h1>{order.number}</h1>
        <p>{order.customer.name} · {order.status}</p>
      </div>
      <div className="card">
        <table>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.id}><td>{line.description}</td><td>{line.quantity.toString()}</td><td>{line.lineTotal.toString()} ₾</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        {order.status === "draft" ? <form action={confirmOrderAction.bind(null, order.id)}><button type="submit">დაჯავშნა</button></form> : null}
        {order.status === "confirmed" ? <form action={fulfillOrderAction.bind(null, order.id)}><button type="submit">მიწოდების დადასტურება</button></form> : null}
        {order.status === "draft" || order.status === "confirmed" ? <form action={cancelOrderAction.bind(null, order.id)}><button className="secondary" type="submit">გაუქმება</button></form> : null}
        {order.status === "fulfilled" && order.invoices.length === 0 ? <form action={invoiceOrderAction.bind(null, order.id)}><button type="submit">ინვოისის შექმნა</button></form> : null}
        {order.invoices[0] ? <a className="button" href={`/finance/invoices/${order.invoices[0].id}`}>ინვოისი</a> : null}
      </div>
    </section>
  );
}
