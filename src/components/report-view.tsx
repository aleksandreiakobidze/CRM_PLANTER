import Link from "next/link";
import type { ReactNode } from "react";
import { moneyPrint } from "@/server/money";

export const REPORTS = [
  { href: "/reports/excursions", label: "ექსკურსიები", hint: "ჯავშნები, ბავშვები, სკოლები, პროგრამები და გიდები" },
  { href: "/reports/crm", label: "CRM", hint: "კლიენტები, დავალებები და შეთავაზებების ძაბრი" },
  { href: "/reports/sales", label: "გაყიდვები", hint: "შემოსავალი კლიენტის, პროდუქტისა და მენეჯერის მიხედვით" },
  { href: "/reports/rental", label: "გაქირავება და მოვლა", hint: "აქტივების დატვირთვა, ჯავშნები და ხელშეკრულებები" },
  { href: "/reports/purchases", label: "შესყიდვები", hint: "მიმწოდებელი, პროდუქტი, შეკვეთილი და მიღებული" },
  { href: "/reports/stock", label: "მარაგი", hint: "ნაშთი თარიღზე და მოძრაობა პერიოდში" },
];

export function ReportNav({ active }: { active: string }) {
  return (
    <nav className="doc-tabs report-nav" aria-label="რეპორტები">
      <Link href="/reports" aria-current={active === "/reports" ? "page" : undefined}>მიმოხილვა</Link>
      {REPORTS.map((report) => (
        <Link key={report.href} href={report.href} aria-current={active === report.href ? "page" : undefined}>{report.label}</Link>
      ))}
    </nav>
  );
}

export function ReportHead({ title, subtitle, active, excel }: { title: string; subtitle: string; active: string; excel?: string }) {
  return (
    <>
      <div className="row">
        <div className="page-head">
          <Link className="back" href="/reports">რეპორტები</Link>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {excel ? (
          <div className="actions">
            <Link className="button secondary" href={excel}>Excel</Link>
          </div>
        ) : null}
      </div>
      <ReportNav active={active} />
    </>
  );
}

export type ReportCard = { label: string; value: ReactNode; hint?: ReactNode };

export function ReportCards({ items }: { items: ReportCard[] }) {
  return (
    <div className="report-cards">
      {items.map((item) => (
        <div key={item.label} className="card">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.hint ? <small>{item.hint}</small> : null}
        </div>
      ))}
    </div>
  );
}

export type BarRow = { key: string; label: ReactNode; value: number; display: ReactNode; hint?: ReactNode };

export function ReportBars({ title, rows, empty = "მონაცემი არ არის.", limit = 10 }: { title: string; rows: BarRow[]; empty?: string; limit?: number }) {
  const shown = rows.slice(0, limit);
  const max = Math.max(0, ...shown.map((row) => row.value)) || 1;
  return (
    <div className="card report-bars">
      <h2>{title}</h2>
      {shown.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul>
          {shown.map((row) => (
            <li key={row.key}>
              <div className="report-bar-head">
                <span>{row.label}</span>
                <strong>{row.display}</strong>
              </div>
              <div className="report-bar-track" aria-hidden>
                <div style={{ width: `${Math.max(2, Math.min(100, (row.value / max) * 100))}%` }} />
              </div>
              {row.hint ? <small>{row.hint}</small> : null}
            </li>
          ))}
        </ul>
      )}
      {rows.length > limit ? <p className="muted report-bars-more">+ კიდევ {rows.length - limit}</p> : null}
    </div>
  );
}

export function ReportGrid({ children }: { children: ReactNode }) {
  return <div className="report-grid">{children}</div>;
}

export function money(value: { toString(): string } | null | undefined) {
  return value == null ? "—" : `${moneyPrint(value.toString())} ₾`;
}

export function int(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString("en-US");
}

export function pct(value: number | null | undefined) {
  return value == null ? "—" : `${value}%`;
}
