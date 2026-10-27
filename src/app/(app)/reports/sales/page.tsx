import Link from "next/link";
import { ComboBox } from "@/components/combo-box";
import { docDate } from "@/components/doc-view";
import { int, money, ReportBars, ReportCards, ReportGrid, ReportHead, type BarRow } from "@/components/report-view";
import { Badge } from "@/components/ui/badge";
import { getActor } from "@/server/auth/session";
import { searchString, type Bucket } from "@/server/features/reports/report-kit";
import { salesReport, type SalesReportFilters } from "@/server/features/reports/sales-report";

const AGING_TONE: Record<string, "success" | "primary" | "warning" | "error"> = { "0–30": "success", "31–60": "primary", "61–90": "warning", "90+": "error" };

function bars(rows: Bucket[], showMoney: boolean, unit = "ინვოისი"): BarRow[] {
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    value: showMoney ? row.amount.toNumber() : row.count,
    display: showMoney ? money(row.amount) : int(row.count),
    hint: `${row.count} ${unit}`,
  }));
}

function productBars(rows: Bucket[], showMoney: boolean): BarRow[] {
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    value: showMoney ? row.amount.toNumber() : row.quantity.toNumber(),
    display: showMoney ? money(row.amount) : row.quantity.toFixed(3).replace(/\.?0+$/, ""),
    hint: `რაოდენობა ${row.quantity.toFixed(3).replace(/\.?0+$/, "")}`,
  }));
}

export default async function SalesReportPage({ searchParams }: { searchParams: Promise<SalesReportFilters> }) {
  const actor = await getActor();
  const search = await searchParams;
  const data = await salesReport(actor, search);
  const { totals, breakdowns, period } = data;
  const exportHref = `/export/sales-report${searchString({ ...search, from: period.from, to: period.to })}`;
  const filtered = Boolean(search.customerId || search.ownerId || search.source);

  return (
    <section className="grid doc">
      <ReportHead title="გაყიდვების რეპორტი" subtitle={`${period.from} — ${period.to} · გატარებული ინვოისები გამოწერის თარიღით`} active="/reports/sales" excel={exportHref} />
      <form className="doc-filters report-filters" action="/reports/sales">
        <label>დან<input type="date" name="from" defaultValue={period.from} /></label>
        <label>მდე<input type="date" name="to" defaultValue={period.to} /></label>
        <label>კლიენტი
          <ComboBox name="customerId" defaultValue={search.customerId ?? ""} options={[{ value: "", label: "ყველა კლიენტი" }, ...data.options.customers]} />
        </label>
        <label>მენეჯერი
          <ComboBox name="ownerId" defaultValue={search.ownerId ?? ""} options={[{ value: "", label: "ყველა" }, { value: "none", label: "მენეჯერის გარეშე" }, ...data.options.owners]} />
        </label>
        <label>წყარო
          <ComboBox name="source" defaultValue={search.source ?? ""} options={[{ value: "", label: "ყველა წყარო" }, ...data.options.sources]} />
        </label>
        <button type="submit" className="secondary">ჩვენება</button>
        {filtered ? <Link className="button secondary" href={`/reports/sales${searchString({ from: period.from, to: period.to })}`}>გასუფთავება</Link> : null}
      </form>

      <ReportCards
        items={
          data.showMoney
            ? [
                { label: "დარიცხული (დღგ-ს გარეშე)", value: money(totals.net), hint: `${totals.invoices} ინვოისი · ${totals.customers} კლიენტი` },
                { label: "დარიცხული სულ", value: money(totals.total), hint: `დღგ ${money(totals.tax)}` },
                { label: "გადახდილი ამ ინვოისებზე", value: money(totals.paid), hint: `საშუალო ინვოისი ${money(totals.average)}` },
                { label: "გაყიდული (მიწოდებული)", value: money(totals.sold), hint: `მარჟა ${money(totals.margin)}` },
                { label: "შემოსული პერიოდში", value: money(totals.received), hint: "გადახდის თარიღით" },
                { label: "ვადაგადაცილება", value: money(totals.overdue), hint: `${data.aging.length} ღია ინვოისი` },
              ]
            : [
                { label: "ინვოისი", value: int(totals.invoices) },
                { label: "კლიენტი", value: int(totals.customers) },
              ]
        }
      />
      {!data.showMoney ? <p className="docv-locked">თანხებს მხოლოდ გაყიდვების რეპორტის უფლების მქონე ხედავს.</p> : null}

      <ReportGrid>
        <ReportBars title="კლიენტები" rows={bars(breakdowns.customers, data.showMoney)} />
        <ReportBars title="პროდუქტი / მომსახურება" rows={productBars(breakdowns.products, data.showMoney)} />
        <ReportBars title="მენეჯერი" rows={bars(breakdowns.owners, data.showMoney)} />
        <ReportBars title="წყარო" rows={bars(breakdowns.sources, data.showMoney)} />
        <ReportBars title="თვეების მიხედვით" rows={bars(breakdowns.months, data.showMoney)} limit={24} />
        {data.showMoney ? (
          <ReportBars
            title="ვადაგადაცილების ჯგუფები"
            rows={["0–30", "31–60", "61–90", "90+"].map((bucket) => {
              const rows = data.aging.filter((row) => row.bucket === bucket);
              const amount = rows.reduce((sum, row) => sum + Number(row.remaining), 0);
              return { key: bucket, label: `${bucket} დღე`, value: amount, display: money(amount.toFixed(2)), hint: `${rows.length} ინვოისი` };
            })}
          />
        ) : null}
      </ReportGrid>

      <div className="card docv-lines">
        <h2 className="docv-lines-title">ინვოისები · {data.rows.length}</h2>
        {data.rows.length === 0 ? <p className="docv-empty">ამ პერიოდში გატარებული ინვოისი არ არის.</p> : (
          <div className="docv-scroll">
            <table className="docv-table">
              <thead>
                <tr>
                  <th>ნომერი</th>
                  <th>თარიღი</th>
                  <th>კლიენტი</th>
                  <th>მენეჯერი</th>
                  <th>წყარო</th>
                  <th className="num">ხაზი</th>
                  {data.showMoney ? <th className="num">დღგ-ს გარეშე</th> : null}
                  {data.showMoney ? <th className="num">სულ</th> : null}
                  {data.showMoney ? <th className="num">დარჩენილი</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="ნომერი"><Link href={`/finance/invoices/${row.id}`}>{row.number ?? "—"}</Link></td>
                    <td data-label="თარიღი">{docDate(row.issuedOn)}</td>
                    <td data-label="კლიენტი"><Link href={`/customers/${row.customerId}`}>{row.customer}</Link></td>
                    <td data-label="მენეჯერი">{row.owner}</td>
                    <td data-label="წყარო">{row.source}</td>
                    <td className="num" data-label="ხაზი">{row.lines}</td>
                    {data.showMoney ? <td className="num" data-label="დღგ-ს გარეშე">{money(row.net)}</td> : null}
                    {data.showMoney ? <td className="num" data-label="სულ">{money(row.total)}</td> : null}
                    {data.showMoney ? (
                      <td className="num" data-label="დარჩენილი">
                        {row.remaining && row.remaining.gt(0) ? money(row.remaining) : <Badge variant="success">გადახდილი</Badge>}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.showMoney && data.aging.length ? (
        <div className="card docv-lines">
          <h2 className="docv-lines-title">ვადაგადაცილებული ინვოისები · {period.to}</h2>
          <table className="docv-table">
            <thead>
              <tr>
                <th>ინვოისი</th>
                <th>კლიენტი</th>
                <th className="num">დარჩენილი</th>
                <th>ჯგუფი</th>
              </tr>
            </thead>
            <tbody>
              {data.aging.map((row) => (
                <tr key={row.invoiceId}>
                  <td data-label="ინვოისი"><Link href={`/finance/invoices/${row.invoiceId}`}>{row.number ?? "—"}</Link></td>
                  <td data-label="კლიენტი">{row.customer}</td>
                  <td className="num" data-label="დარჩენილი">{money(row.remaining)}</td>
                  <td data-label="ჯგუფი"><Badge variant={AGING_TONE[row.bucket] ?? "light"}>{row.bucket}</Badge> <span className="muted">{row.days} დღე</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="report-note">
        დარიცხული — გატარებული ინვოისის ხაზების ჯამი გამოწერის თარიღით. გაყიდული — მიწოდებული შეკვეთის ხაზები. შემოსული — რეალური გადახდები გადახდის თარიღით. მენეჯერი — კლიენტის პასუხისმგებელი.
      </p>
    </section>
  );
}
