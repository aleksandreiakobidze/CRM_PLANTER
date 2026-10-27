import Link from "next/link";
import { ComboBox } from "@/components/combo-box";
import { docDate } from "@/components/doc-view";
import { int, money, pct, ReportBars, ReportCards, ReportGrid, ReportHead, type BarRow } from "@/components/report-view";
import { getActor } from "@/server/auth/session";
import { RENTAL_STATUS_LABEL, rentalReport, type RentalReportFilters } from "@/server/features/reports/rental-report";
import { searchString, type Bucket } from "@/server/features/reports/report-kit";

function bars(rows: Bucket[], showMoney: boolean): BarRow[] {
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    value: showMoney ? row.amount.toNumber() : row.count,
    display: showMoney ? money(row.amount) : `${row.count} ჯავშანი`,
    hint: `${row.count} ჯავშანი · ${row.quantity.toNumber()} აქტივი`,
  }));
}

function counts(rows: Bucket[]): BarRow[] {
  return rows.map((row) => ({ key: row.key, label: row.label, value: row.count, display: int(row.count) }));
}

function qty(value: { toFixed(places: number): string }) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export default async function RentalReportPage({ searchParams }: { searchParams: Promise<RentalReportFilters> }) {
  const actor = await getActor();
  const search = await searchParams;
  const data = await rentalReport(actor, search);
  const { totals, breakdowns, period } = data;
  const exportHref = `/export/rental-report${searchString({ ...search, from: period.from, to: period.to })}`;
  const filtered = Boolean(search.customerId || search.status);

  return (
    <section className="grid doc">
      <ReportHead title="გაქირავება და მოვლა" subtitle={`${period.from} — ${period.to} · პერიოდს გადამკვეთი ჯავშნები, შემოსავალი დღეების წილით`} active="/reports/rental" excel={exportHref} />
      <form className="doc-filters report-filters" action="/reports/rental">
        <label>დან<input type="date" name="from" defaultValue={period.from} /></label>
        <label>მდე<input type="date" name="to" defaultValue={period.to} /></label>
        <label>კლიენტი
          <ComboBox name="customerId" defaultValue={search.customerId ?? ""} options={[{ value: "", label: "ყველა კლიენტი" }, ...data.options.customers]} />
        </label>
        <label>ჯავშნის სტატუსი
          <ComboBox name="status" defaultValue={search.status ?? ""} options={[{ value: "", label: "ყველა სტატუსი" }, ...Object.entries(RENTAL_STATUS_LABEL).map(([value, label]) => ({ value, label }))]} />
        </label>
        <button type="submit" className="secondary">ჩვენება</button>
        {filtered ? <Link className="button secondary" href={`/reports/rental${searchString({ from: period.from, to: period.to })}`}>გასუფთავება</Link> : null}
      </form>

      <ReportCards
        items={[
          { label: "ჯავშანი", value: int(totals.bookings), hint: `${totals.active} აქტიური` },
          ...(data.showMoney ? [{ label: "გაქირავების შემოსავალი", value: money(totals.revenue), hint: `დეპოზიტი ${money(totals.deposits)}` }] : []),
          { label: "აქტივების დატვირთვა", value: pct(totals.utilisation), hint: `${totals.assets} აქტივი · ${totals.idle} უმოქმედო` },
          { label: "მოვლის ხელშეკრულება", value: int(totals.contracts), hint: "აქტიური" },
          ...(data.showMoney ? [{ label: "მოვლის თვიური შემოსავალი", value: money(totals.mrr), hint: "აქტიური ხელშეკრულებები" }] : []),
          { label: "შეცვლილი მცენარე", value: qty(totals.replacements), hint: totals.replacementCost ? `თვითღირებულება ${money(totals.replacementCost)}` : "პერიოდში" },
        ]}
      />

      <ReportGrid>
        <ReportBars title="კლიენტები" rows={bars(breakdowns.customers, data.showMoney)} />
        <ReportBars title="თვეები (დაწყებით)" rows={bars(breakdowns.months, data.showMoney)} limit={24} />
        <ReportBars title="ჯავშნის სტატუსი" rows={counts(breakdowns.statuses)} />
        <ReportBars title="აქტივების მდგომარეობა ახლა" rows={counts(breakdowns.assetStatus)} />
      </ReportGrid>

      <div className="card docv-lines">
        <h2 className="docv-lines-title">აქტივების დატვირთვა · {data.assets.length}</h2>
        {data.assets.length === 0 ? <p className="docv-empty">აქტივი არ არის.</p> : (
          <div className="docv-scroll">
            <table className="docv-table">
              <thead>
                <tr>
                  <th>კოდი</th>
                  <th>აქტივი</th>
                  <th>ლოკაცია</th>
                  <th>მდგომარეობა</th>
                  <th className="num">ჯავშანი</th>
                  <th className="num">დღე</th>
                  <th>დატვირთვა</th>
                  {data.showMoney ? <th className="num">შემოსავალი</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.assets.map((row) => (
                  <tr key={row.id}>
                    <td data-label="კოდი"><span className="docv-code">{row.code}</span></td>
                    <td data-label="აქტივი">{row.name}</td>
                    <td data-label="ლოკაცია">{row.location}</td>
                    <td data-label="მდგომარეობა">{row.status}</td>
                    <td className="num" data-label="ჯავშანი">{row.bookings}</td>
                    <td className="num" data-label="დღე">{row.days}</td>
                    <td data-label="დატვირთვა">
                      <div className="report-inline-bar"><div className="report-bar-track"><div style={{ width: `${Math.max(2, row.utilisation)}%` }} /></div><span>{row.utilisation}%</span></div>
                    </td>
                    {data.showMoney ? <td className="num" data-label="შემოსავალი">{money(row.revenue)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card docv-lines">
        <h2 className="docv-lines-title">ჯავშნები · {data.rows.length}</h2>
        {data.rows.length === 0 ? <p className="docv-empty">ამ პერიოდში ჯავშანი არ არის.</p> : (
          <div className="docv-scroll">
            <table className="docv-table">
              <thead>
                <tr>
                  <th>ნომერი</th>
                  <th>კლიენტი</th>
                  <th>პერიოდი</th>
                  <th className="num">აქტივი</th>
                  <th className="num">დღე პერიოდში</th>
                  <th>სტატუსი</th>
                  {data.showMoney ? <th className="num">ჯამი</th> : null}
                  {data.showMoney ? <th className="num">დეპოზიტი</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="ნომერი"><Link href={`/rental/${row.id}`}>{row.number}</Link></td>
                    <td data-label="კლიენტი"><Link href={`/customers/${row.customerId}`}>{row.customer}</Link></td>
                    <td data-label="პერიოდი">{docDate(row.startOn)} — {docDate(row.endOn)}<span className="docv-code">{row.billingDays} დღე</span></td>
                    <td className="num" data-label="აქტივი">{row.assets}</td>
                    <td className="num" data-label="დღე პერიოდში">{row.overlap}</td>
                    <td data-label="სტატუსი">{row.statusLabel}</td>
                    {data.showMoney ? <td className="num" data-label="ჯამი">{money(row.total)}</td> : null}
                    {data.showMoney ? <td className="num" data-label="დეპოზიტი">{money(row.deposit)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card docv-lines">
        <h2 className="docv-lines-title">მოვლის ხელშეკრულებები · {data.contracts.length}</h2>
        {data.contracts.length === 0 ? <p className="docv-empty">ამ პერიოდში ხელშეკრულება არ არის.</p> : (
          <table className="docv-table">
            <thead>
              <tr>
                <th>ნომერი</th>
                <th>კლიენტი</th>
                <th>მოქმედება</th>
                <th>სტატუსი</th>
                <th className="num">მცენარე</th>
                <th className="num">%</th>
                {data.showMoney ? <th className="num">საბაზისო</th> : null}
                {data.showMoney ? <th className="num">თვიური</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.contracts.map((row) => (
                <tr key={row.id}>
                  <td data-label="ნომერი"><Link href={`/maintenance/${row.id}`}>{row.number}</Link></td>
                  <td data-label="კლიენტი"><Link href={`/customers/${row.customerId}`}>{row.customer}</Link></td>
                  <td data-label="მოქმედება">{docDate(row.startOn)} — {row.endOn ? docDate(row.endOn) : "უვადო"}</td>
                  <td data-label="სტატუსი">{row.statusLabel}</td>
                  <td className="num" data-label="მცენარე">{qty(row.plants)}</td>
                  <td className="num" data-label="%">{row.percent.toFixed(0)}%</td>
                  {data.showMoney ? <td className="num" data-label="საბაზისო">{money(row.base)}</td> : null}
                  {data.showMoney ? <td className="num" data-label="თვიური">{money(row.fee)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="report-note">დატვირთვა — აქტივის დაკავებული დღეები პერიოდის დღეებთან. შემოსავალი პერიოდს გადამკვეთ ჯავშანზე ნაწილდება დღეების წილით. დრაფტი და გაუქმებული არ ითვლება.</p>
    </section>
  );
}
