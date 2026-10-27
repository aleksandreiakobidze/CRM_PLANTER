import Link from "next/link";
import { ReportNav, REPORTS } from "@/components/report-view";
import { ReportsBoard } from "@/components/reports-board";
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
    <section className="grid doc">
      <ReportNav active="/reports" />
      <ReportsBoard
        month={month}
        from={bounds.start}
        to={bounds.end}
        showSales={data.showSales}
        sales={data.sales}
        overdue={data.overdue}
        aging={data.aging}
        openPoCount={data.openPoCount}
        batchCount={data.batchCount}
        deliveryStopCount={data.deliveryStopCount}
      />
      <h2 className="report-hub-title">დეტალური რეპორტები</h2>
      <div className="report-hub">
        {REPORTS.map((report) => (
          <Link key={report.href} className="card" href={`${report.href}?from=${bounds.start}&to=${bounds.end}`}>
            <strong>{report.label}</strong>
            <span>{report.hint}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
