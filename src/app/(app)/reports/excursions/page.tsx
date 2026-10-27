import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ComboBox } from "@/components/combo-box";
import { int, money, pct, ReportBars, ReportCards, ReportGrid, ReportHead, type BarRow } from "@/components/report-view";
import { Badge } from "@/components/ui/badge";
import { getActor } from "@/server/auth/session";
import { EXCURSION_STATUSES, excursionReport, type ExcursionReportFilters } from "@/server/features/reports/excursion-report";
import type { Bucket } from "@/server/features/reports/report-kit";
import { searchString } from "@/server/features/reports/report-kit";
import { excursionStatusLabel } from "@/server/labels";
import { BUSINESS_TIME_ZONE } from "@/server/time";

const STATUS_TONE: Record<string, "success" | "primary" | "warning" | "error" | "light"> = {
  requested: "warning",
  confirmed: "primary",
  completed: "success",
  cancelled: "error",
};

function bars(rows: Bucket[], showMoney: boolean): BarRow[] {
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    value: row.quantity.toNumber(),
    display: `${int(row.quantity.toNumber())} ბავშვი`,
    hint: `${row.count} ჯავშანი${showMoney ? ` · ${money(row.amount)}` : ""}`,
  }));
}

export default async function ExcursionReportPage({ searchParams }: { searchParams: Promise<ExcursionReportFilters> }) {
  const actor = await getActor();
  const search = await searchParams;
  const data = await excursionReport(actor, search);
  const { totals, breakdowns, options, period } = data;
  const exportHref = `/export/excursion-report${searchString({ ...search, from: period.from, to: period.to })}`;
  const filtered = Boolean(search.customerId || search.programId || search.guideId || search.status || search.photo);

  return (
    <section className="grid doc">
      <ReportHead
        title="ექსკურსიების რეპორტი"
        subtitle={`${period.from} — ${period.to} · ჯავშნის დაწყების თარიღით`}
        active="/reports/excursions"
        excel={exportHref}
      />
      <form className="doc-filters report-filters" action="/reports/excursions">
        <label>დან<input type="date" name="from" defaultValue={period.from} /></label>
        <label>მდე<input type="date" name="to" defaultValue={period.to} /></label>
        <label>სკოლა / კლიენტი
          <ComboBox name="customerId" defaultValue={search.customerId ?? ""} options={[{ value: "", label: "ყველა კლიენტი" }, ...options.customers]} />
        </label>
        <label>პროგრამა
          <ComboBox name="programId" defaultValue={search.programId ?? ""} options={[{ value: "", label: "ყველა პროგრამა" }, { value: "none", label: "ინდივიდუალური" }, ...options.programs]} />
        </label>
        <label>გიდი
          <ComboBox name="guideId" defaultValue={search.guideId ?? ""} options={[{ value: "", label: "ყველა გიდი" }, { value: "none", label: "გიდის გარეშე" }, ...options.guides]} />
        </label>
        <label>სტატუსი
          <ComboBox name="status" defaultValue={search.status ?? ""} options={[{ value: "", label: "ყველა სტატუსი" }, ...EXCURSION_STATUSES.map((code) => ({ value: code, label: excursionStatusLabel(code) }))]} />
        </label>
        <label>ფოტო
          <ComboBox name="photo" defaultValue={search.photo ?? ""} options={[{ value: "", label: "ყველა" }, { value: "yes", label: "ფოტო ნებადართულია" }, { value: "no", label: "ფოტო არ შეიძლება" }]} />
        </label>
        <button type="submit" className="secondary">ჩვენება</button>
        {filtered ? <Link className="button secondary" href={`/reports/excursions${searchString({ from: period.from, to: period.to })}`}>გასუფთავება</Link> : null}
      </form>

      <ReportCards
        items={[
          { label: "ჯავშანი", value: int(totals.bookings), hint: `${totals.completed} დასრულებული · ${totals.cancelled} გაუქმებული` },
          { label: "დაგეგმილი ბავშვი", value: int(totals.planned), hint: "გაუქმებულის გარეშე" },
          { label: "მოვიდა", value: int(totals.attended), hint: `დასწრება ${pct(totals.attendanceRate)}` },
          { label: "ანგარიშსაწერი", value: int(totals.billable), hint: "დასრულებულ ჯავშნებზე" },
          ...(data.showMoney ? [{ label: "შემოსავალი", value: money(totals.revenue), hint: `საშუალოდ ${money(totals.perChild)} ბავშვზე` }] : []),
          { label: "გაუქმება", value: pct(totals.cancelRate), hint: `${totals.cancelled} ჯავშანი` },
        ]}
      />

      <ReportGrid>
        <ReportBars title="თვეების მიხედვით" rows={bars(breakdowns.months, data.showMoney)} limit={24} />
        <ReportBars title="სკოლები / კლიენტები" rows={bars(breakdowns.customers, data.showMoney)} />
        <ReportBars title="პროგრამები" rows={bars(breakdowns.programs, data.showMoney)} />
        <ReportBars title="გიდები" rows={bars(breakdowns.guides, data.showMoney)} />
      </ReportGrid>

      <div className="card docv-lines">
        <h2 className="docv-lines-title">ჯავშნები · {data.rows.length}</h2>
        {data.rows.length === 0 ? <p className="docv-empty">ამ პერიოდში ჯავშანი არ არის.</p> : (
          <div className="docv-scroll">
            <table className="docv-table">
              <thead>
                <tr>
                  <th>ნომერი</th>
                  <th>თარიღი</th>
                  <th>კლიენტი</th>
                  <th>პროგრამა</th>
                  <th>გიდი</th>
                  <th>სტატუსი</th>
                  <th>ფოტო</th>
                  <th className="num">დაგეგმილი</th>
                  <th className="num">მოვიდა</th>
                  <th className="num">ანგარიშსაწერი</th>
                  {data.showMoney ? <th className="num">შემოსავალი</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="ნომერი"><Link href={`/excursions/${row.id}`}>{row.number}</Link></td>
                    <td data-label="თარიღი">
                      {formatInTimeZone(row.startsAt, BUSINESS_TIME_ZONE, "dd.MM.yyyy")}
                      <span className="docv-code">{formatInTimeZone(row.startsAt, BUSINESS_TIME_ZONE, "HH:mm")}–{formatInTimeZone(row.endsAt, BUSINESS_TIME_ZONE, "HH:mm")} · {row.resource}</span>
                    </td>
                    <td data-label="კლიენტი">
                      <Link href={`/customers/${row.customerId}`}>{row.customer}</Link>
                      <span className="docv-code">{row.segment}</span>
                    </td>
                    <td data-label="პროგრამა">
                      {row.program}
                      {row.note ? <span className="docv-code">{row.note}</span> : null}
                    </td>
                    <td data-label="გიდი">{row.guides.length ? row.guides.join(", ") : "—"}</td>
                    <td data-label="სტატუსი"><Badge variant={STATUS_TONE[row.status] ?? "light"}>{row.statusLabel}</Badge></td>
                    <td data-label="ფოტო">{row.photoAllowed ? "კი" : "არა"}</td>
                    <td className="num" data-label="დაგეგმილი">{row.planned}</td>
                    <td className="num" data-label="მოვიდა">{int(row.attended)}</td>
                    <td className="num" data-label="ანგარიშსაწერი">{int(row.billable)}</td>
                    {data.showMoney ? <td className="num" data-label="შემოსავალი">{money(row.revenue)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="report-note">
          შემოსავალი: პროგრამით დაჯავშნილზე — ფასი ბავშვზე × ანგარიშსაწერი (დაუსრულებელზე დაგეგმილი), დანარჩენზე — ჯავშნის ფასი. გაუქმებული შემოსავალში და ბავშვებში არ ითვლება.
        </p>
      </div>
    </section>
  );
}
