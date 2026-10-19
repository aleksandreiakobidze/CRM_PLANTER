import Link from "next/link";
import { RecordList } from "@/components/record-list";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { D } from "@/server/money";
import { statusBadge } from "@/server/labels";

export default async function QuotesPage() {
  const actor = await getActor();
  const quotes = await getDb().quote.findMany({
    where: { organizationId: actor.organizationId },
    include: { customer: true, lines: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <section className="grid">
      <div className="row">
        <h1>შეთავაზებები</h1>
        <div className="actions">
          <Link className="button secondary" href="/export/quotes">Excel</Link>
          <Link className="button" href="/sales/quotes/new">ახალი შეთავაზება</Link>
        </div>
      </div>
      <RecordList
        storageKey="quotes"
        empty="შეთავაზება ჯერ არ არის."
        columns={[
          { key: "number", header: "ნომერი" },
          { key: "customer", header: "კლიენტი" },
          { key: "status", header: "სტატუსი" },
          { key: "total", header: "ჯამი" },
        ]}
        rows={quotes.map((quote) => {
          const badge = statusBadge(quote.status);
          return {
            id: quote.id,
            cells: {
              number: <Link href={`/sales/quotes/${quote.id}`}>{quote.number}</Link>,
              customer: quote.customer.name,
              status: <span className="badge" style={{ background: badge.color, color: "white" }}>{badge.label}</span>,
              total: `${quote.lines.reduce((sum, line) => sum.plus(D(line.lineTotal)), D(0)).toFixed(2)} ₾`,
            },
          };
        })}
      />
    </section>
  );
}
