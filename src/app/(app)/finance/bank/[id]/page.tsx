import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { customerOption } from "@/lib/customer-option";
import { confirmBankRowAction, skipBankRowAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { formatDateOnly } from "@/server/time";

export default async function BankBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const batch = await getDb().bankImportBatch.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { rows: true },
  });
  if (!batch) notFound();
  const [customers, invoices] = await Promise.all([
    getDb().customer.findMany({ where: { organizationId: actor.organizationId, mergedIntoId: null }, orderBy: { name: "asc" } }),
    getDb().invoice.findMany({ where: { organizationId: actor.organizationId, status: "posted" }, orderBy: { issuedOn: "desc" } }),
  ]);
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/finance/bank">ამონაწერები</Link>
        <h1>{batch.filename}</h1>
        <p>ხელით დაადასტურეთ თითო სტრიქონი. იგივე ფაილი ახალ გადახდას აღარ შექმნის.</p>
      </div>
      {batch.rows.map((row) => (
        <div className="card" key={row.id}>
          <p>{formatDateOnly(row.paidOn)} · {row.amount.toString()} ₾ · {row.purpose}</p>
          <p>სტატუსი: {row.status}</p>
          {row.status === "pending" ? (
            <>
              <BoundForm action={confirmBankRowAction} label="გადახდის დადასტურება">
                <input type="hidden" name="rowId" value={row.id} />
                <label>კლიენტი
                  <ComboBox name="customerId" required options={customers.map(customerOption)} />
                </label>
                <label>ინვოისი
                  <ComboBox
                    name="invoiceId"
                    options={[{ value: "", label: "განაწილების გარეშე" }, ...invoices.map((item) => ({ value: item.id, label: item.number ?? item.id }))]}
                  />
                </label>
              </BoundForm>
              <form action={skipBankRowAction.bind(null, row.id)}><button className="secondary" type="submit">გამოტოვება</button></form>
            </>
          ) : null}
        </div>
      ))}
    </section>
  );
}
