import Link from "next/link";
import { RecordList } from "@/components/record-list";
import { getActor } from "@/server/auth/session";
import { opsDashboard } from "@/server/features/reports/ops-reports";
import { periodBounds, tbilisiDateString } from "@/server/time";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await getActor();
  const params = await searchParams;
  const month = params.month ?? tbilisiDateString().slice(0, 7);
  const bounds = periodBounds(month);
  const data = await opsDashboard(actor, bounds.start, bounds.end);
  return (
    <section className="grid">
      <div className="row">
        <h1>რეპორტები</h1>
        <div className="actions">
          <Link className="button secondary" href={`/export/reports?from=${bounds.start}&to=${bounds.end}`}>Excel</Link>
        </div>
      </div>
      <form className="card row" action="/reports">
        <label>პერიოდი<input name="month" type="month" defaultValue={month} /></label>
        <button type="submit">გახსნა</button>
      </form>
      <div className="metrics">
        <article className="card metric"><h2>გაყიდული</h2><p>{data.sales.sold} ₾</p><small>{data.sales.basis.sold}</small></article>
        <article className="card metric"><h2>დარიცხული</h2><p>{data.sales.invoiced} ₾</p><small>{data.sales.basis.invoiced}</small></article>
        <article className="card metric"><h2>შემოსული</h2><p>{data.sales.received} ₾</p><small>{data.sales.basis.received}</small></article>
        <article className="card metric"><h2>ვადაგადაცილება</h2><p>{data.overdue} ₾</p><small>დარჩენილი remaining</small></article>
      </div>
      <p className="card">ინტეგრაციის მონაცემი: {data.integration}. გაყიდული, დარიცხული და შემოსული ცალკეა. დეპოზიტი შემოსულში არ შედის.</p>
      <div className="card">
        <p>ღია PO: {data.openPoCount} · სათბურის პარტია: {data.batchCount} · დღის გაჩერება: {data.deliveryStopCount}</p>
        <p>
          <Link href="/purchases">შესყიდვები</Link> · <Link href="/greenhouse">სათბური</Link> · <Link href="/delivery">მიწოდება</Link> · <Link href="/finance/invoices">ინვოისები</Link>
        </p>
      </div>
      <RecordList
        storageKey="aging"
        empty="ვადაგადაცილებული ინვოისი არ არის."
        columns={[
          { key: "number", header: "ინვოისი" },
          { key: "customer", header: "კლიენტი" },
          { key: "remaining", header: "დარჩენილი" },
          { key: "bucket", header: "aging" },
        ]}
        rows={data.aging.map((row) => ({
          id: row.invoiceId,
          cells: {
            number: <Link href={`/finance/invoices/${row.invoiceId}`}>{row.number ?? "—"}</Link>,
            customer: row.customer,
            remaining: `${row.remaining} ₾`,
            bucket: `${row.bucket} · ${row.days} დღე`,
          },
        }))}
      />
    </section>
  );
}
