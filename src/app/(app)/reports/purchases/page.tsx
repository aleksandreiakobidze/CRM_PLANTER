import Link from "next/link";
import { ComboBox } from "@/components/combo-box";
import { docDate } from "@/components/doc-view";
import { int, money, pct, ReportBars, ReportCards, ReportGrid, ReportHead, type BarRow } from "@/components/report-view";
import { getActor } from "@/server/auth/session";
import { PURCHASE_STATUS_LABEL, purchaseReport, type PurchaseReportFilters } from "@/server/features/reports/purchase-report";
import { searchString, type Bucket } from "@/server/features/reports/report-kit";

function qty(value: { toFixed(places: number): string }) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function bars(rows: Bucket[], showMoney: boolean, unit = "შეკვეთა"): BarRow[] {
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    value: showMoney ? row.amount.toNumber() : row.quantity.toNumber(),
    display: showMoney ? money(row.amount) : qty(row.quantity),
    hint: `${row.count} ${unit} · რაოდენობა ${qty(row.quantity)}`,
  }));
}

export default async function PurchaseReportPage({ searchParams }: { searchParams: Promise<PurchaseReportFilters> }) {
  const actor = await getActor();
  const search = await searchParams;
  const data = await purchaseReport(actor, search);
  const { totals, breakdowns, period } = data;
  const exportHref = `/export/purchase-report${searchString({ ...search, from: period.from, to: period.to })}`;
  const filtered = Boolean(search.supplierId || search.status);

  return (
    <section className="grid doc">
      <ReportHead title="შესყიდვების რეპორტი" subtitle={`${period.from} — ${period.to} · შეკვეთები შექმნის თარიღით, მიღებები მიღების თარიღით`} active="/reports/purchases" excel={exportHref} />
      <form className="doc-filters report-filters" action="/reports/purchases">
        <label>დან<input type="date" name="from" defaultValue={period.from} /></label>
        <label>მდე<input type="date" name="to" defaultValue={period.to} /></label>
        <label>მიმწოდებელი
          <ComboBox name="supplierId" defaultValue={search.supplierId ?? ""} options={[{ value: "", label: "ყველა მიმწოდებელი" }, ...data.options.suppliers]} />
        </label>
        <label>სტატუსი
          <ComboBox name="status" defaultValue={search.status ?? ""} options={[{ value: "", label: "ყველა (გაუქმებულის გარეშე)" }, ...Object.entries(PURCHASE_STATUS_LABEL).map(([value, label]) => ({ value, label }))]} />
        </label>
        <button type="submit" className="secondary">ჩვენება</button>
        {filtered ? <Link className="button secondary" href={`/reports/purchases${searchString({ from: period.from, to: period.to })}`}>გასუფთავება</Link> : null}
      </form>

      <ReportCards
        items={[
          { label: "შეკვეთა", value: int(totals.orders), hint: `${totals.suppliers} მიმწოდებელი` },
          ...(data.showMoney
            ? [
                { label: "შეკვეთილი", value: money(totals.ordered), hint: `რაოდენობა ${qty(totals.orderedQty)}` },
                { label: "მიღებული", value: money(totals.received), hint: `შესრულება ${pct(totals.fulfilment)}` },
                { label: "დარჩენილი მისაღები", value: money(totals.outstanding), hint: `${totals.openLines} ღია ხაზი` },
                { label: "დამატებითი ხარჯი", value: money(totals.landed), hint: `შეკვეთილის ${pct(totals.landedShare)}` },
                { label: "მიღება პერიოდში", value: money(totals.receiptValue), hint: `${totals.receipts} მიღების დოკუმენტი` },
              ]
            : [
                { label: "შეკვეთილი რაოდენობა", value: qty(totals.orderedQty) },
                { label: "მიღებული რაოდენობა", value: qty(totals.receivedQty), hint: `შესრულება ${pct(totals.fulfilment)}` },
                { label: "ღია ხაზი", value: int(totals.openLines) },
              ]),
        ]}
      />

      <ReportGrid>
        <ReportBars title="მიმწოდებლები" rows={bars(breakdowns.suppliers, data.showMoney)} />
        <ReportBars title="პროდუქტები" rows={bars(breakdowns.products, data.showMoney, "ხაზი")} />
        <ReportBars title="თვეები" rows={bars(breakdowns.months, data.showMoney)} limit={24} />
      </ReportGrid>

      <div className="card docv-lines">
        <h2 className="docv-lines-title">შეკვეთები · {data.rows.length}</h2>
        {data.rows.length === 0 ? <p className="docv-empty">ამ პერიოდში შეკვეთა არ არის.</p> : (
          <div className="docv-scroll">
            <table className="docv-table">
              <thead>
                <tr>
                  <th>ნომერი</th>
                  <th>თარიღი</th>
                  <th>მიმწოდებელი</th>
                  <th>სტატუსი</th>
                  <th className="num">ხაზი</th>
                  <th>მიღება</th>
                  {data.showMoney ? <th className="num">შეკვეთილი</th> : null}
                  {data.showMoney ? <th className="num">დარჩენილი</th> : null}
                  {data.showMoney ? <th className="num">დამ. ხარჯი</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="ნომერი"><Link href={`/purchases/${row.id}`}>{row.number}</Link></td>
                    <td data-label="თარიღი">{docDate(row.createdAt, true)}{row.expectedOn ? <span className="docv-code">მოსალოდნელი {docDate(row.expectedOn)}</span> : null}</td>
                    <td data-label="მიმწოდებელი">{row.supplier}</td>
                    <td data-label="სტატუსი">{row.statusLabel}</td>
                    <td className="num" data-label="ხაზი">{row.lines}</td>
                    <td data-label="მიღება">
                      <div className="report-inline-bar"><div className="report-bar-track"><div style={{ width: `${Math.max(2, row.progress)}%` }} /></div><span>{qty(row.receivedQty)} / {qty(row.quantity)}</span></div>
                    </td>
                    {data.showMoney ? <td className="num" data-label="შეკვეთილი">{money(row.ordered)}</td> : null}
                    {data.showMoney ? <td className="num" data-label="დარჩენილი">{money(row.outstanding)}</td> : null}
                    {data.showMoney ? <td className="num" data-label="დამ. ხარჯი">{money(row.landed)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card docv-lines">
        <h2 className="docv-lines-title">მისაღები ხაზები · {data.outstandingLines.length}</h2>
        {data.outstandingLines.length === 0 ? <p className="docv-empty">ყველაფერი მიღებულია.</p> : (
          <div className="docv-scroll">
            <table className="docv-table">
              <thead>
                <tr>
                  <th>შეკვეთა</th>
                  <th>მიმწოდებელი</th>
                  <th>აითემი</th>
                  <th>მოსალოდნელი</th>
                  <th className="num">შეკვეთილი</th>
                  <th className="num">მიღებული</th>
                  <th className="num">დარჩა</th>
                  {data.showMoney ? <th className="num">ღირებულება</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.outstandingLines.map((row) => (
                  <tr key={row.id}>
                    <td data-label="შეკვეთა"><Link href={`/purchases/${row.orderId}`}>{row.number}</Link></td>
                    <td data-label="მიმწოდებელი">{row.supplier}</td>
                    <td data-label="აითემი">{row.name}<span className="docv-code">{row.code}</span></td>
                    <td data-label="მოსალოდნელი">{docDate(row.expectedOn)}</td>
                    <td className="num" data-label="შეკვეთილი">{qty(row.quantity)}</td>
                    <td className="num" data-label="მიღებული">{qty(row.receivedQty)}</td>
                    <td className="num qty-out" data-label="დარჩა">{qty(row.open)}</td>
                    {data.showMoney ? <td className="num" data-label="ღირებულება">{money(row.value)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="report-note">მიღებული და დარჩენილი შეკვეთის ფასით ითვლება. დამატებითი ხარჯი (ტრანსპორტი, განბაჟება) ლარში, კურსით. „მიღება პერიოდში“ — მიღების დოკუმენტები თვითღირებულებით.</p>
    </section>
  );
}
