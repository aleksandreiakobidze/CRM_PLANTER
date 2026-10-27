import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ComboBox } from "@/components/combo-box";
import { docMoney } from "@/components/doc-view";
import { Badge } from "@/components/ui/badge";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { listMovements, MOVEMENT_GROUPS, type MovementFilters } from "@/server/features/inventory/movement-journal";
import { BUSINESS_TIME_ZONE } from "@/server/time";

type Search = { from?: string; to?: string; locationId?: string; q?: string; type?: string; source?: string; page?: string };

function query(search: Search, patch: Partial<Search> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...search, ...patch })) if (value) params.set(key, value);
  return params.toString();
}

function qty(value: { toFixed(places: number): string }) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export default async function MovementsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await getActor();
  const search = await searchParams;
  const filters: MovementFilters = { ...search, page: Number(search.page) || 1 };
  const [data, locations] = await Promise.all([
    listMovements(actor, filters),
    getDb().location.findMany({ where: { organizationId: actor.organizationId }, orderBy: { code: "asc" } }),
  ]);
  const exportQuery = query({ ...search, page: undefined });
  const posted = search.source ? data.rows[0] : null;

  return (
    <section className="grid doc">
      <div className="row">
        <div className="page-head">
          <Link className="back" href="/inventory">მარაგი</Link>
          <h1>{posted ? `${posted.source.label} · გატარებული` : "მარაგის მოძრაობა"}</h1>
          <p>ყოველი გატარება აქ ჩანს. ჩანაწერი არ იცვლება და არ იშლება — შესწორება ახალი გატარებით ხდება.</p>
        </div>
        <div className="actions">
          <Link className="button secondary" href={`/export/movements${exportQuery ? `?${exportQuery}` : ""}`}>Excel</Link>
          <Link className="button secondary" href="/inventory/transfer">გადატანა</Link>
          <Link className="button" href="/inventory/opening">საწყისი ნაშთი</Link>
        </div>
      </div>
      {posted ? (
        <p className="docv-locked">
          <Badge variant="success">გატარებული</Badge>
          დოკუმენტი დაკეტილია · {data.total} ჩანაწერი · <Link href="/inventory/movements">სრული ჟურნალი</Link>
        </p>
      ) : null}
      <form className="doc-filters" action="/inventory/movements">
        {search.source ? <input type="hidden" name="source" value={search.source} /> : null}
        <label>დან<input type="date" name="from" defaultValue={search.from ?? ""} /></label>
        <label>მდე<input type="date" name="to" defaultValue={search.to ?? ""} /></label>
        <label>ლოკაცია
          <ComboBox name="locationId" defaultValue={search.locationId ?? ""} options={[{ value: "", label: "ყველა ლოკაცია" }, ...locations.map((item) => ({ value: item.id, label: item.nameKa }))]} />
        </label>
        <label>ტიპი
          <ComboBox name="type" defaultValue={search.type ?? ""} options={[{ value: "", label: "ყველა ტიპი" }, ...MOVEMENT_GROUPS.map((group) => ({ value: group.code, label: group.label }))]} />
        </label>
        <label>აითემი<input name="q" defaultValue={search.q ?? ""} placeholder="შიდა კოდი, SKU ან სახელი" /></label>
        <button type="submit" className="secondary">გაფილტვრა</button>
        {exportQuery ? <Link className="button secondary" href="/inventory/movements">გასუფთავება</Link> : null}
      </form>
      <div className="report-cards">
        <div className="card"><span>ჩანაწერი</span><strong>{data.total}</strong></div>
        <div className="card"><span>შემოსვლა</span><strong>{qty(data.totals.incoming)}</strong></div>
        <div className="card"><span>გასვლა</span><strong>{qty(data.totals.outgoing)}</strong></div>
        {data.totals.value ? <div className="card"><span>წმინდა ღირებულება</span><strong>{docMoney(data.totals.value)}</strong></div> : null}
      </div>
      <div className="card docv-lines">
        {data.rows.length === 0 ? <p className="docv-empty docv-empty-pad">მოძრაობა ვერ მოიძებნა.</p> : (
          <div className="docv-scroll">
            <table className="docv-table">
              <thead>
                <tr>
                  <th>თარიღი</th>
                  <th>აითემი</th>
                  <th>ტიპი</th>
                  <th>ლოკაცია</th>
                  <th className="num">რაოდენობა</th>
                  {data.showCost ? <th className="num">ღირებულება</th> : null}
                  <th>დოკუმენტი</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="თარიღი">{formatInTimeZone(row.occurredAt, BUSINESS_TIME_ZONE, "dd.MM.yyyy HH:mm")}</td>
                    <td data-label="აითემი">
                      {row.name}
                      <span className="docv-code">{row.code}</span>
                    </td>
                    <td data-label="ტიპი">{row.typeLabel}</td>
                    <td data-label="ლოკაცია">{row.location}</td>
                    <td className={`num ${row.quantity.lt(0) ? "qty-out" : "qty-in"}`} data-label="რაოდენობა">
                      {row.quantity.gt(0) ? "+" : ""}{qty(row.quantity)}
                    </td>
                    {data.showCost ? <td className="num" data-label="ღირებულება">{row.value ? docMoney(row.value) : "—"}</td> : null}
                    <td data-label="დოკუმენტი">
                      {row.source.href ? <Link href={row.source.href}>{row.source.label}</Link> : row.source.label}
                      {row.reason || row.actor ? <span className="docv-code">{[row.reason, row.actor].filter(Boolean).join(" · ")}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data.pages > 1 ? (
        <nav className="doc-tabs" aria-label="გვერდები">
          {data.page > 1 ? <Link href={`/inventory/movements?${query(search, { page: String(data.page - 1) })}`}>წინა</Link> : null}
          <span className="muted">{data.page} / {data.pages}</span>
          {data.page < data.pages ? <Link href={`/inventory/movements?${query(search, { page: String(data.page + 1) })}`}>შემდეგი</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}
