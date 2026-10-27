import Link from "next/link";
import { ComboBox } from "@/components/combo-box";
import { docDate } from "@/components/doc-view";
import { int, money, pct, ReportBars, ReportCards, ReportGrid, ReportHead, type BarRow } from "@/components/report-view";
import { getActor } from "@/server/auth/session";
import { crmReport, type CrmReportFilters } from "@/server/features/reports/crm-report";
import { searchString, type Bucket } from "@/server/features/reports/report-kit";
import { displayPhone } from "@/server/phone";

function bars(rows: Bucket[], total: number): BarRow[] {
  return rows.map((row) => ({ key: row.key || "none", label: row.label, value: row.count, display: int(row.count), hint: `${pct(total ? Math.round((row.count / total) * 1000) / 10 : null)}` }));
}

export default async function CrmReportPage({ searchParams }: { searchParams: Promise<CrmReportFilters> }) {
  const actor = await getActor();
  const search = await searchParams;
  const data = await crmReport(actor, search);
  const { totals, breakdowns, period } = data;
  const exportHref = `/export/crm-report${searchString({ ...search, from: period.from, to: period.to })}`;
  const filtered = Boolean(search.ownerId || search.segment);

  return (
    <section className="grid doc">
      <ReportHead title="CRM რეპორტი" subtitle={`${period.from} — ${period.to} · ახალი კლიენტები, დავალებები და შეთავაზებები პერიოდში; სტატუსები დღევანდელი`} active="/reports/crm" excel={exportHref} />
      <form className="doc-filters report-filters" action="/reports/crm">
        <label>დან<input type="date" name="from" defaultValue={period.from} /></label>
        <label>მდე<input type="date" name="to" defaultValue={period.to} /></label>
        <label>პასუხისმგებელი
          <ComboBox name="ownerId" defaultValue={search.ownerId ?? ""} options={[{ value: "", label: "ყველა" }, { value: "none", label: "უპასუხისმგებლო" }, ...data.options.owners]} />
        </label>
        <label>სეგმენტი
          <ComboBox name="segment" defaultValue={search.segment ?? ""} options={[{ value: "", label: "ყველა სეგმენტი" }, ...data.options.segments]} />
        </label>
        <button type="submit" className="secondary">ჩვენება</button>
        {filtered ? <Link className="button secondary" href={`/reports/crm${searchString({ from: period.from, to: period.to })}`}>გასუფთავება</Link> : null}
      </form>

      <ReportCards
        items={[
          { label: "კლიენტი", value: int(totals.customers), hint: `${totals.active} მომხმარებელი · ${pct(totals.conversion)}` },
          { label: "ახალი პერიოდში", value: int(totals.newCustomers) },
          { label: "ვადაგასული კონტაქტი", value: int(totals.overdueContacts), hint: "შემდეგი კონტაქტის თარიღი გავიდა" },
          { label: "შეთავაზება", value: int(totals.quotes), hint: `შეკვეთა გახდა ${pct(totals.quoteWin)} · უარი ${totals.declined}` },
          { label: "დავალება", value: int(totals.tasksCreated), hint: `${totals.tasksDone} შესრულდა პერიოდში` },
          { label: "ღია დავალება", value: int(totals.tasksOpen), hint: `${totals.tasksOverdue} ვადაგასული` },
        ]}
      />

      <div className="card docv-lines">
        <h2 className="docv-lines-title">შეთავაზებების ძაბრი</h2>
        <div className="report-funnel">
          {data.funnel.map((row) => (
            <div key={row.key}>
              <span>{row.label}</span>
              <strong>{int(row.count)}</strong>
              <div className="report-bar-track" aria-hidden><div style={{ width: `${Math.max(2, row.rate ?? 0)}%` }} /></div>
              <small>{pct(row.rate)}{data.showMoney ? ` · ${money(row.value)}` : ""}</small>
            </div>
          ))}
        </div>
      </div>

      <ReportGrid>
        <ReportBars title="სტატუსის მიხედვით" rows={bars(breakdowns.status, totals.customers)} />
        <ReportBars title="პრიორიტეტი" rows={bars(breakdowns.priority, totals.customers)} />
        <ReportBars title="ზონები" rows={bars(breakdowns.zones, totals.customers)} />
        <ReportBars title="ობიექტის ტიპი" rows={bars(breakdowns.types, totals.customers)} />
        <ReportBars title="პასუხისმგებელი" rows={bars(breakdowns.owners, totals.customers)} />
        <ReportBars title="ახალი კლიენტები სეგმენტით" rows={bars(breakdowns.newBySegment, totals.newCustomers)} empty="ამ პერიოდში ახალი კლიენტი არ არის." />
      </ReportGrid>

      <div className="card docv-lines">
        <h2 className="docv-lines-title">გუნდი · დავალებები</h2>
        {data.team.length === 0 ? <p className="docv-empty">დავალება არ არის.</p> : (
          <table className="docv-table">
            <thead>
              <tr>
                <th>თანამშრომელი</th>
                <th className="num">შექმნა</th>
                <th className="num">მიეწერა</th>
                <th className="num">შეასრულა</th>
                <th className="num">ღია</th>
                <th className="num">ვადაგასული</th>
              </tr>
            </thead>
            <tbody>
              {data.team.map((row) => (
                <tr key={row.id}>
                  <td data-label="თანამშრომელი">{row.name}</td>
                  <td className="num" data-label="შექმნა">{row.created}</td>
                  <td className="num" data-label="მიეწერა">{row.assigned}</td>
                  <td className="num" data-label="შეასრულა">{row.done}</td>
                  <td className="num" data-label="ღია">{row.open}</td>
                  <td className={`num ${row.overdue ? "qty-out" : ""}`} data-label="ვადაგასული">{row.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card docv-lines">
        <h2 className="docv-lines-title">ვადაგასული კონტაქტები · {data.overdue.length}</h2>
        {data.overdue.length === 0 ? <p className="docv-empty">ყველა კონტაქტი დროულადაა.</p> : (
          <div className="docv-scroll">
            <table className="docv-table">
              <thead>
                <tr>
                  <th>კლიენტი</th>
                  <th>სტატუსი</th>
                  <th>პასუხისმგებელი</th>
                  <th>ტელეფონი</th>
                  <th>უნდა დაკავშირებოდა</th>
                  <th className="num">დაგვიანება</th>
                </tr>
              </thead>
              <tbody>
                {data.overdue.slice(0, 200).map((row) => (
                  <tr key={row.id}>
                    <td data-label="კლიენტი"><Link href={`/customers/${row.id}`}>{row.name}</Link></td>
                    <td data-label="სტატუსი">{row.status}</td>
                    <td data-label="პასუხისმგებელი">{row.owner}</td>
                    <td data-label="ტელეფონი">{row.phone ? <a href={`tel:${row.phone}`}>{displayPhone(row.phone)}</a> : "—"}</td>
                    <td data-label="უნდა დაკავშირებოდა">{docDate(row.nextContactOn)}</td>
                    <td className="num qty-out" data-label="დაგვიანება">{row.days} დღე</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
