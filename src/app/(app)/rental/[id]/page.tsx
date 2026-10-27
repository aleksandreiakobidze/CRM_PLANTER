import Link from "next/link";
import { notFound } from "next/navigation";
import { DocFacts, DocHeader, DocLines, docDate, docMoney } from "@/components/doc-view";
import { Badge } from "@/components/ui/badge";
import { deliverRentalAction, invoiceRentalAction, returnRentalAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { docStatus } from "@/server/labels";

export default async function RentalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const booking = await getDb().rentalBooking.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { lines: { include: { asset: { include: { variant: { select: { nameKa: true } } } } } }, customer: true, deposits: true },
  });
  if (!booking) notFound();
  const invoice = await getDb().invoice.findFirst({
    where: { organizationId: actor.organizationId, sourceType: "rental", sourceId: booking.id },
  });
  return (
    <section className="grid doc">
      <DocHeader
        back={{ href: "/rental", label: "გაქირავება" }}
        title={booking.number}
        status={docStatus("rental", booking.status)}
        subtitle={<Link href={`/crm/customers/${booking.customerId}`}>{booking.customer.name}</Link>}
        actions={
          <>
            {booking.status === "confirmed" ? <form action={deliverRentalAction.bind(null, booking.id)}><button type="submit">გაცემა</button></form> : null}
            {invoice ? (
              <Link className="button secondary" href={`/finance/invoices/${invoice.id}`}>ინვოისი {invoice.number ?? "(დრაფტი)"}</Link>
            ) : (
              <form action={invoiceRentalAction.bind(null, booking.id)}><button type="submit" className="secondary">ინვოისის შექმნა</button></form>
            )}
          </>
        }
      />
      <DocFacts
        items={[
          { label: "კლიენტი", value: booking.customer.name },
          { label: "პერიოდი", value: `${docDate(booking.startOn)} — ${docDate(booking.endOn)}` },
          { label: "დღეები", value: String(booking.billingDays) },
          { label: "მცენარეები", value: String(booking.lines.length) },
          { label: "ჯამი", value: docMoney(booking.total, booking.currency) },
          { label: "დეპოზიტი", value: docMoney(booking.depositAmount, booking.currency) },
        ]}
      />
      <DocLines
        title="მცენარეები"
        columns={[
          { key: "item", header: "მცენარე" },
          { key: "status", header: "სტატუსი" },
          { key: "total", header: "ფასი", align: "right" },
          { key: "action", header: "დაბრუნება" },
        ]}
        rows={booking.lines.map((line) => {
          const status = docStatus("asset", line.asset.status);
          return {
            id: line.id,
            cells: {
              item: (
                <>
                  {line.asset.variant.nameKa}
                  <span className="docv-code">{line.asset.internalCode ?? line.asset.code} · {line.asset.code}</span>
                </>
              ),
              status: <Badge variant={status.tone}>{status.label}</Badge>,
              total: docMoney(line.lineTotal, booking.currency),
              action:
                line.asset.status === "on_rent" ? (
                  <span className="docv-actions">
                    <form action={returnRentalAction.bind(null, booking.id, line.assetId, "healthy")}><button type="submit">ჯანმრთელი</button></form>
                    <form action={returnRentalAction.bind(null, booking.id, line.assetId, "damaged")}><button className="secondary" type="submit">დაზიანებული</button></form>
                  </span>
                ) : "—",
            },
          };
        })}
        totals={[{ label: "ჯამი", value: docMoney(booking.total, booking.currency), strong: true }]}
      />
    </section>
  );
}
