import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { DocFacts, DocHeader, DocLines, DocSection, docDate, docMoney } from "@/components/doc-view";
import { PostingForm } from "@/components/posting-form";
import { paymentAction, postDraftInvoiceAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { invoiceBalance } from "@/server/features/finance/invoice-service";
import { loadInvoiceSources } from "@/server/features/finance/invoice-source";
import { docStatus } from "@/server/labels";
import { D, moneyText } from "@/server/money";
import { tbilisiDateString } from "@/server/time";

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
    include: {
      lines: { orderBy: { sort: "asc" } },
      customer: true,
      order: true,
      allocations: { include: { payment: true } },
    },
  });
  if (!invoice) notFound();
  const sources = await loadInvoiceSources(actor.organizationId, [invoice]);
  const source = sources.get(invoice.id) ?? null;
  const balance = await invoiceBalance(invoice.id);
  const variantIds = invoice.lines.map((line) => line.variantId).filter((value): value is string => Boolean(value));
  const variants = variantIds.length
    ? await getDb().productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, internalCode: true, sku: true } })
    : [];
  const codeOf = new Map(variants.map((variant) => [variant.id, variant.internalCode ?? variant.sku]));
  const payments = [...invoice.allocations].sort((left, right) => {
    const byDate = left.payment.paidOn.getTime() - right.payment.paidOn.getTime();
    if (byDate !== 0) return byDate;
    return left.payment.createdAt.getTime() - right.payment.createdAt.getTime();
  });
  const remaining = balance.remaining.gt(0);
  const draft = invoice.status === "draft";
  const paid = invoice.status === "posted" && D(invoice.total).gt(0) && !remaining;
  const status = paid ? docStatus("invoice", "paid") : docStatus("invoice", invoice.status);
  const lineSum = invoice.lines.reduce((sum, line) => sum.plus(line.lineTotal), D(0));
  const discount = invoice.lines.reduce((sum, line) => sum.plus(line.discountAmount), D(0));
  const adjustment = D(invoice.subtotal).minus(lineSum);

  return (
    <section className="grid doc">
      <DocHeader
        back={{ href: "/finance/invoices", label: "ინვოისები" }}
        title={invoice.number ?? "დრაფტი ინვოისი"}
        status={status}
        subtitle={
          <>
            <Link href={`/crm/customers/${invoice.customerId}`}>{invoice.customer.name}</Link>
            {source ? <> · <Link href={source.href}>{source.label}</Link></> : null}
          </>
        }
        actions={
          draft ? (
            <Link className="button secondary" href={`/finance/invoices/${invoice.id}/edit`}>რედაქტირება</Link>
          ) : (
            <a className="button secondary" href={`/finance/invoices/${invoice.id}/pdf`}>PDF</a>
          )
        }
      />
      {draft && invoice.draftReason ? <p className="docv-locked">{invoice.draftReason}</p> : null}
      {!draft ? <p className="docv-locked">გატარებული ინვოისი დაკეტილია. შესწორება კრედიტ-ნოტით ხდება.</p> : null}
      <DocFacts
        items={[
          { label: "კლიენტი", value: invoice.customer.name },
          { label: "გაცემის თარიღი", value: docDate(invoice.issuedOn) },
          { label: "გადახდის ვადა", value: docDate(invoice.dueOn) },
          { label: "ჯამი", value: docMoney(balance.total, invoice.currency) },
          { label: "დაფარული", value: docMoney(balance.allocated, invoice.currency) },
          { label: "დარჩენილი", value: docMoney(balance.remaining, invoice.currency) },
        ]}
      />
      <DocLines
        title="ხაზები"
        columns={[
          { key: "item", header: "დასახელება" },
          { key: "qty", header: "რაოდენობა", align: "right" },
          { key: "price", header: "ფასი", align: "right" },
          { key: "discount", header: "ფასდაკლება", align: "right" },
          { key: "total", header: "ჯამი", align: "right" },
        ]}
        rows={invoice.lines.map((line) => ({
          id: line.id,
          cells: {
            item: (
              <>
                {line.description}
                {line.variantId ? <span className="docv-code">{codeOf.get(line.variantId)}</span> : null}
              </>
            ),
            qty: line.quantity.toString(),
            price: docMoney(line.unitPrice, invoice.currency),
            discount: D(line.discountAmount).gt(0) ? docMoney(line.discountAmount, invoice.currency) : "—",
            total: docMoney(line.lineTotal, invoice.currency),
          },
        }))}
        totals={[
          ...(discount.gt(0) ? [{ label: "ფასდაკლება", value: `−${docMoney(discount, invoice.currency)}` }] : []),
          ...(!adjustment.isZero() ? [{ label: "დამრგვალება", value: docMoney(adjustment, invoice.currency) }] : []),
          { label: "ქვეჯამი", value: docMoney(invoice.subtotal, invoice.currency) },
          ...(D(invoice.taxTotal).gt(0) ? [{ label: "დღგ", value: docMoney(invoice.taxTotal, invoice.currency) }] : []),
          { label: "ჯამი", value: docMoney(invoice.total, invoice.currency), strong: true },
        ]}
      />
      {draft ? (
        <DocSection title="გატარება">
          <PostingForm
            action={postDraftInvoiceAction}
            label="ინვოისის გატარება"
            summary={[
              { label: "კლიენტი", value: invoice.customer.name },
              { label: "ხაზები", value: String(invoice.lines.length) },
              { label: "ჯამი", value: docMoney(invoice.total, invoice.currency) },
            ]}
          >
            <input type="hidden" name="invoiceId" value={invoice.id} />
          </PostingForm>
        </DocSection>
      ) : null}
      {paid ? <p className="ok">სრულად დაფარულია</p> : null}
      {payments.length > 0 ? (
        <DocSection title="გადახდები">
          <table className="docv-table">
            <thead><tr><th>თარიღი</th><th>მეთოდი</th><th className="num">თანხა</th></tr></thead>
            <tbody>
              {payments.map((row) => (
                <tr key={row.id}>
                  <td data-label="თარიღი">{docDate(row.payment.paidOn)}</td>
                  <td data-label="მეთოდი">{METHOD_LABELS[row.payment.method] ?? row.payment.method}</td>
                  <td className="num" data-label="თანხა">{docMoney(row.amount, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DocSection>
      ) : null}
      {invoice.status === "posted" && remaining ? (
        <DocSection title="გადახდის დაფიქსირება">
          <BoundForm action={paymentAction} label="გადახდის დაფიქსირება">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
            <div className="docv-fields">
              <label>თანხა<input name="amount" required defaultValue={moneyText(balance.remaining)} /></label>
              <label>მეთოდი<ComboBox name="method" options={PAYMENT_METHODS} defaultValue="bank" /></label>
              <label>თარიღი<input name="paidOn" type="date" required defaultValue={tbilisiDateString()} /></label>
            </div>
          </BoundForm>
        </DocSection>
      ) : null}
    </section>
  );
}
