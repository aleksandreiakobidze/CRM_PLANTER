import Link from "next/link";
import { BoundForm } from "@/components/bound-form";
import { RecordList } from "@/components/record-list";
import { bankImportAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { formatDateOnly } from "@/server/time";

export default async function BankImportPage() {
  const actor = await getActor();
  const batches = await getDb().bankImportBatch.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: { createdAt: "desc" },
  });
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/finance/invoices">ინვოისები</Link>
        <h1>ბანკის ამონაწერი</h1>
        <p>CSV/Excel არ არის ბანკის API. იგივე ფაილის hash მეორე გადახდას არ ქმნის. ხელით დადასტურება სავალდებულოა.</p>
      </div>
      <div className="card">
        <BoundForm action={bankImportAction} label="ატვირთვა">
          <label>ფაილი<input name="file" type="file" accept=".csv,.txt" required /></label>
          <label>თარიღის სვეტი<input name="dateColumn" defaultValue="date" /></label>
          <label>თანხის სვეტი<input name="amountColumn" defaultValue="amount" /></label>
          <label>დანიშნულების სვეტი<input name="purposeColumn" defaultValue="purpose" /></label>
          <label>რეფერენსი<input name="referenceColumn" defaultValue="reference" /></label>
        </BoundForm>
      </div>
      <RecordList
        storageKey="bank-batches"
        empty="ამონაწერი ჯერ არ არის."
        columns={[
          { key: "file", header: "ფაილი" },
          { key: "status", header: "სტატუსი" },
          { key: "date", header: "თარიღი" },
        ]}
        rows={batches.map((batch) => ({
          id: batch.id,
          cells: {
            file: <Link href={`/finance/bank/${batch.id}`}>{batch.filename}</Link>,
            status: batch.status,
            date: formatDateOnly(batch.createdAt),
          },
        }))}
      />
    </section>
  );
}
