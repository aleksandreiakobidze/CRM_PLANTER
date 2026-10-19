import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { paymentAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { invoiceBalance } from "@/server/features/finance/invoice-service";
import { moneyText } from "@/server/money";
import { tbilisiDateString } from "@/server/time";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const invoice = await getDb().invoice.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { lines: true, customer: true },
  });
  if (!invoice) notFound();
  const balance = await invoiceBalance(invoice.id);
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/finance/invoices">ინვოისები</Link>
        <h1>{invoice.number ?? "Draft ინვოისი"}</h1>
        <p>{invoice.customer.name} · {invoice.status}</p>
      </div>
      {invoice.draftReason ? <p className="err">{invoice.draftReason}</p> : null}
      <div className="card">
        <table>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id}><td>{line.description}</td><td>{line.quantity.toString()}</td><td>{line.lineTotal.toString()}</td></tr>
            ))}
          </tbody>
        </table>
        <p>ჯამი: {moneyText(balance.total)} ₾</p>
        <p>დაფარული: {moneyText(balance.allocated)} ₾</p>
        <p>დარჩენილი: {moneyText(balance.remaining)} ₾</p>
      </div>
      {invoice.status === "posted" ? <a className="button" href={`/finance/invoices/${invoice.id}/pdf`}>PDF</a> : null}
      {invoice.status === "posted" && balance.remaining.gt(0) ? (
        <div className="card">
          <h2>გადახდის დაფიქსირება</h2>
          <BoundForm action={paymentAction} label="გადახდის დაფიქსირება">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
            <label>თანხა<input name="amount" required defaultValue={moneyText(balance.remaining)} /></label>
            <label>თარიღი<input name="paidOn" type="date" required defaultValue={tbilisiDateString()} /></label>
          </BoundForm>
        </div>
      ) : null}
    </section>
  );
}
