import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { paymentAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { invoiceBalance } from "@/server/features/finance/invoice-service";
import { loadInvoiceSources } from "@/server/features/finance/invoice-source";
import { moneyText } from "@/server/money";
import { formatDateOnly, tbilisiDateString } from "@/server/time";

const PAYMENT_METHODS = [
  { value: "bank", label: "ბანკი" },
  { value: "cash", label: "ნაღდი" },
  { value: "online", label: "ონლაინ" },
];

const METHOD_LABELS: Record<string, string> = {
  bank: "ბანკი",
  cash: "ნაღდი",
  online: "ონლაინ",
};

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const invoice = await getDb().invoice.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { lines: { orderBy: { sort: "asc" } }, customer: true, order: true, allocations: { include: { payment: true } } },
  });
  if (!invoice) notFound();
  const sources = await loadInvoiceSources(actor.organizationId, [invoice]);
  const source = sources.get(invoice.id) ?? null;
  const balance = await invoiceBalance(invoice.id);
  const payments = [...invoice.allocations].sort((left, right) => {
    const byDate = left.payment.paidOn.getTime() - right.payment.paidOn.getTime();
    if (byDate !== 0) return byDate;
    return left.payment.createdAt.getTime() - right.payment.createdAt.getTime();
  });
  const remaining = balance.remaining.gt(0);
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/finance/invoices">ინვოისები</Link>
        <h1>{invoice.number ?? "Draft ინვოისი"}</h1>
        <p>{invoice.customer.name} · {invoice.status}</p>
        {source ? <p><Link href={source.href}>{source.label}</Link></p> : null}
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
        {invoice.status === "posted" && !remaining ? <p className="ok">სრულად დაფარულია</p> : null}
      </div>
      {invoice.status === "posted" ? <a className="button" href={`/finance/invoices/${invoice.id}/pdf`}>PDF</a> : null}
      {payments.length > 0 ? (
        <div className="card">
          <h2>გადახდები</h2>
          <table>
            <thead>
              <tr>
                <th>თარიღი</th>
                <th>მეთოდი</th>
                <th>თანხა</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateOnly(row.payment.paidOn)}</td>
                  <td>{METHOD_LABELS[row.payment.method] ?? row.payment.method}</td>
                  <td>{moneyText(row.amount)} ₾</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {invoice.status === "posted" && remaining ? (
        <div className="card">
          <h2>გადახდის დაფიქსირება</h2>
          <BoundForm action={paymentAction} label="გადახდის დაფიქსირება">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
            <label>თანხა<input name="amount" required defaultValue={moneyText(balance.remaining)} /></label>
            <label>მეთოდი<ComboBox name="method" options={PAYMENT_METHODS} defaultValue="bank" /></label>
            <label>თარიღი<input name="paidOn" type="date" required defaultValue={tbilisiDateString()} /></label>
          </BoundForm>
        </div>
      ) : null}
    </section>
  );
}
