import Link from "next/link";
import { RecordList } from "@/components/record-list";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { D, moneyText } from "@/server/money";
import { statusBadge } from "@/server/labels";
import { loadInvoiceSources } from "@/server/features/finance/invoice-source";

export default async function InvoicesPage() {
  const actor = await getActor();
  if (!actor.permissions.has("finance.read")) return <p>ფინანსებზე წვდომა არ გაქვთ.</p>;
  const invoices = await getDb().invoice.findMany({
    where: { organizationId: actor.organizationId },
    include: { customer: true, order: true, allocations: true },
    orderBy: { createdAt: "desc" },
  });
  const sources = await loadInvoiceSources(actor.organizationId, invoices);
  return (
    <section className="grid">
      <div className="row">
        <h1>ინვოისები</h1>
        <Link className="button secondary" href="/export/invoices">Excel</Link>
          <Link className="button secondary" href="/finance/bank">ბანკის ამონაწერი</Link>
      </div>
      <RecordList
        storageKey="invoices"
        empty="ინვოისი ჯერ არ არის."
        columns={[
          { key: "number", header: "ნომერი" },
          { key: "source", header: "წყარო" },
          { key: "customer", header: "კლიენტი" },
          { key: "status", header: "სტატუსი" },
          { key: "total", header: "ჯამი" },
          { key: "left", header: "დარჩენილი" },
        ]}
        rows={invoices.map((invoice) => {
          const allocated = invoice.allocations.reduce((sum, row) => sum.plus(D(row.amount)), D("0"));
          const badge = statusBadge(invoice.status);
          const source = sources.get(invoice.id);
          return {
            id: invoice.id,
            cells: {
              number: <Link href={`/finance/invoices/${invoice.id}`}>{invoice.number ?? "draft"}</Link>,
              source: source ? <Link href={source.href}>{source.label}</Link> : "",
              customer: invoice.customer.name,
              status: <span className="badge" style={{ background: badge.color, color: "white" }}>{badge.label}</span>,
              total: moneyText(D(invoice.total)),
              left: moneyText(D(invoice.total).minus(allocated)),
            },
          };
        })}
      />
    </section>
  );
}
