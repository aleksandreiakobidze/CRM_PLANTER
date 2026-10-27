import Link from "next/link";
import { ComboBox } from "@/components/combo-box";
import { int, money, ReportBars, ReportCards, ReportGrid, ReportHead, type BarRow } from "@/components/report-view";
import { getActor } from "@/server/auth/session";
import { searchString, type Bucket } from "@/server/features/reports/report-kit";
import { stockReport, type StockReportFilters } from "@/server/features/reports/stock-report";

const ROW_LIMIT = 500;

function qty(value: { toFixed(places: number): string }) {
  return value.toFixed(3).replace(/\.?0+$/, "") || "0";
}

function bars(rows: Bucket[], showCost: boolean): BarRow[] {
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    value: showCost ? row.amount.toNumber() : row.quantity.toNumber(),
    display: showCost ? money(row.amount) : qty(row.quantity),
    hint: `${row.count} პოზიცია · ნაშთი ${qty(row.quantity)}`,
  }));
}

export default async function StockReportPage({ searchParams }: { searchParams: Promise<StockReportFilters> }) {
  const actor = await getActor();
  const search = await searchParams;
  const data = await stockReport(actor, search);
  const { totals, breakdowns, period } = data;
  const exportHref = `/export/stock-report${searchString({ ...search, from: period.from, to: period.to })}`;
  const filtered = Boolean(search.locationId || search.category || search.q || search.only);
  return (
    <section className="grid doc">
      <ReportHead title="მარაგის რეპორტი" subtitle={`ნაშთი ${period.to}-ის ბოლოს · მოძრაობა ${period.from} — ${period.to} · შეფასება საშუალო თვითღირებულებით`} active="/reports/stock" excel={exportHref} />
      <form className="doc-filters report-filters" action="/reports/stock">
        <label>დან<input type="date" name="from" defaultValue={period.from} /></label>
        <label>ნაშთის თარიღი<input type="date" name="to" defaultValue={period.to} /></label>
        <label>ლოკაცია
          <ComboBox name="locationId" defaultValue={search.locationId ?? ""} options={[{ value: "", label: "ყველა ლოკაცია" }, ...data.options.locations]} />
        </label>
        <label>კატეგორია
          <ComboBox name="category" defaultValue={search.category ?? ""} options={[{ value: "", label: "ყველა კატეგორია" }, ...data.options.categories]} />
        </label>
        <label>ჩვენება
          <ComboBox name="only" defaultValue={search.only ?? ""} options={[{ value: "", label: "ყველა პოზიცია" }, { value: "stock", label: "მხოლოდ ნაშთიანი" }, { value: "moved", label: "მხოლოდ მოძრავი" }]} />
        </label>
        <label>აითემი<input name="q" defaultValue={search.q ?? ""} placeholder="შიდა კოდი, SKU ან სახელი" /></label>
        <button type="submit" className="secondary">ჩვენება</button>
        {filtered ? <Link className="button secondary" href={`/reports/stock${searchString({ from: period.from, to: period.to })}`}>გასუფთავება</Link> : null}
      </form>

      <ReportCards
        items={[
          { label: "აითემი ნაშთით", value: int(totals.items), hint: `${totals.rows} პოზიცია ლოკაციით` },
          { label: "საწყისი ნაშთი", value: qty(totals.opening), hint: period.from },
          { label: "შემოსვლა", value: qty(totals.incoming) },
          { label: "გასვლა", value: qty(totals.outgoing) },
          { label: "საბოლოო ნაშთი", value: qty(totals.closing), hint: totals.negative ? `${totals.negative} უარყოფითი პოზიცია` : period.to },
          ...(data.showCost ? [{ label: "ღირებულება", value: money(totals.value), hint: "საშუალო თვითღირებულებით" }] : []),
        ]}
      />

      <ReportGrid>
        <ReportBars title="ლოკაციები" rows={bars(breakdowns.locations, data.showCost)} />
        <ReportBars title="კატეგორიები" rows={bars(breakdowns.categories, data.showCost)} />
        <ReportBars
          title="მოძრაობის ტიპები პერიოდში"
          rows={breakdowns.types.map((row) => ({
            key: row.key,
            label: row.label,
            value: row.quantity.abs().toNumber(),
            display: `${row.quantity.gt(0) ? "+" : ""}${qty(row.quantity)}`,
            hint: `${row.count} ჩანაწერი`,
          }))}
          empty="ამ პერიოდში მოძრაობა არ არის."
          limit={16}
        />
      </ReportGrid>

      <div className="card docv-lines">
        <h2 className="docv-lines-title">ნაშთი და მოძრაობა · {data.rows.length}</h2>
        {data.rows.length === 0 ? <p className="docv-empty">პოზიცია ვერ მოიძებნა.</p> : (
          <div className="docv-scroll">
            <table className="docv-table">
              <thead>
                <tr>
                  <th>აითემი</th>
                  <th>კატეგორია</th>
                  <th>ლოკაცია</th>
                  <th className="num">საწყისი</th>
                  <th className="num">შემოსვლა</th>
                  <th className="num">გასვლა</th>
                  <th className="num">საბოლოო</th>
                  {data.showCost ? <th className="num">საშ. თვითღ.</th> : null}
                  {data.showCost ? <th className="num">ღირებულება</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.rows.slice(0, ROW_LIMIT).map((row) => (
                  <tr key={row.id}>
                    <td data-label="აითემი">
                      <Link href={`/inventory/movements${searchString({ q: row.sku, locationId: row.locationId, from: period.from, to: period.to })}`}>{row.name}</Link>
                      <span className="docv-code">{row.code}</span>
                    </td>
                    <td data-label="კატეგორია">{row.category}</td>
                    <td data-label="ლოკაცია">{row.location}</td>
                    <td className="num" data-label="საწყისი">{qty(row.opening)}</td>
                    <td className="num qty-in" data-label="შემოსვლა">{row.incoming.isZero() ? "—" : `+${qty(row.incoming)}`}</td>
                    <td className="num qty-out" data-label="გასვლა">{row.outgoing.isZero() ? "—" : `−${qty(row.outgoing)}`}</td>
                    <td className={`num ${row.closing.lt(0) ? "qty-out" : ""}`} data-label="საბოლოო"><strong>{qty(row.closing)}</strong></td>
                    {data.showCost ? <td className="num" data-label="საშ. თვითღ.">{row.averageCost ? row.averageCost.toFixed(4) : "—"}</td> : null}
                    {data.showCost ? <td className="num" data-label="ღირებულება">{money(row.value)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.rows.length > ROW_LIMIT ? <p className="report-note">ნაჩვენებია პირველი {ROW_LIMIT}. სრული სია Excel-შია.</p> : null}
      </div>
      <p className="report-note">საბოლოო ნაშთი = დღევანდელი ნაშთი − არჩეული თარიღის შემდეგ მომხდარი მოძრაობა. ღირებულება მიმდინარე საშუალო თვითღირებულებით.</p>
    </section>
  );
}
