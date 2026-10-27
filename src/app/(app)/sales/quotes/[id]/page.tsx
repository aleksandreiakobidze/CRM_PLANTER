import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { DocFacts, DocHeader, DocLines, DocSection, docDate, docMoney } from "@/components/doc-view";
import { convertQuoteAction, setQuoteStatusAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { docStatus } from "@/server/labels";
import { LINE_KIND_LABEL, isLineKind } from "@/server/features/sales/line-kinds";
import { QUOTE_EDITABLE } from "@/server/features/sales/order-service";
import { D } from "@/server/money";
import { BUSINESS_TIME_ZONE, tbilisiDateString } from "@/server/time";

const EVENT_LABEL: Record<string, string> = {
  "quote.create": "შეიქმნა",
  "quote.update": "შეიცვალა",
  "quote.sent": "გაეგზავნა კლიენტს",
  "quote.accepted": "კლიენტმა მიიღო",
  "quote.declined": "კლიენტმა უარყო",
  "quote.draft": "დაბრუნდა დრაფტში",
  "quote.converted": "გარდაიქმნა შეკვეთად",
};

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const quote = await getDb().quote.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { lines: { orderBy: { sort: "asc" } }, customer: true, order: true },
  });
  if (!quote) notFound();
  const events = await getDb().auditLog.findMany({
    where: { organizationId: actor.organizationId, entityType: "quote", entityId: quote.id },
    orderBy: { createdAt: "asc" },
  });
  const actorIds = [...new Set([quote.createdById, ...events.map((event) => event.actorId)].filter((value): value is string => Boolean(value)))];
  const users = actorIds.length ? await getDb().user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
  const userName = new Map(users.map((user) => [user.id, user.name]));
  const variantIds = quote.lines.map((line) => line.variantId).filter((value): value is string => Boolean(value));
  const variants = variantIds.length
    ? await getDb().productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, internalCode: true, sku: true } })
    : [];
  const codeOf = new Map(variants.map((variant) => [variant.id, variant.internalCode ?? variant.sku]));

  const gross = quote.lines.reduce((sum, line) => sum.plus(D(line.quantity).mul(line.unitPrice)), D(0));
  const discount = quote.lines.reduce((sum, line) => sum.plus(line.discountAmount), D(0));
  const total = quote.lines.reduce((sum, line) => sum.plus(line.lineTotal), D(0));
  const expired = Boolean(quote.validUntil && ["draft", "sent"].includes(quote.status) && quote.validUntil.toISOString().slice(0, 10) < tbilisiDateString());
  const status = docStatus("quote", quote.status);
  const timeline = events.length
    ? events
    : [{ id: "created", action: "quote.create", actorId: quote.createdById, createdAt: quote.createdAt }];

  return (
    <section className="grid doc">
      <DocHeader
        back={{ href: "/sales/quotes", label: "შეთავაზებები" }}
        title={quote.number}
        status={status}
        subtitle={<Link href={`/crm/customers/${quote.customerId}`}>{quote.customer.name}</Link>}
        actions={
          <>
            {QUOTE_EDITABLE.has(quote.status) ? <Link className="button secondary" href={`/sales/quotes/${quote.id}/edit`}>რედაქტირება</Link> : null}
            {quote.status === "draft" ? (
              <form action={setQuoteStatusAction.bind(null, quote.id, "sent")}><button type="submit" className="secondary">გაგზავნილად მონიშვნა</button></form>
            ) : null}
            {quote.status === "draft" || quote.status === "sent" ? (
              <>
                <form action={setQuoteStatusAction.bind(null, quote.id, "declined")}><button type="submit" className="secondary">უარყო</button></form>
                <form action={setQuoteStatusAction.bind(null, quote.id, "accepted")}><button type="submit" className="secondary">მიიღო</button></form>
              </>
            ) : null}
            {quote.status === "declined" ? (
              <form action={setQuoteStatusAction.bind(null, quote.id, "draft")}><button type="submit" className="secondary">დრაფტში დაბრუნება</button></form>
            ) : null}
            {quote.order ? (
              <Link className="button" href={`/sales/orders/${quote.order.id}`}>შეკვეთა {quote.order.number}</Link>
            ) : quote.status !== "declined" ? (
              <form action={convertQuoteAction.bind(null, quote.id)}><button type="submit">შეკვეთად გარდაქმნა</button></form>
            ) : null}
          </>
        }
      />
      <DocFacts
        items={[
          { label: "კლიენტი", value: quote.customer.name },
          { label: "თარიღი", value: docDate(quote.createdAt, true) },
          { label: "მოქმედების ვადა", value: expired ? <span className="err">{docDate(quote.validUntil)} · ვადაგასული</span> : docDate(quote.validUntil) },
          { label: "მომზადებულია", value: (quote.createdById && userName.get(quote.createdById)) || "—" },
          { label: "ჯამი", value: docMoney(total, quote.currency) },
          { label: "შენიშვნა", value: quote.notes || "—" },
        ]}
      />
      <div className="docv-grid">
        <DocLines
          title="ხაზები"
          columns={[
            { key: "item", header: "დასახელება" },
            { key: "qty", header: "რაოდენობა", align: "right" },
            { key: "price", header: "ფასი", align: "right" },
            { key: "discount", header: "ფასდაკლება", align: "right" },
            { key: "total", header: "ჯამი", align: "right" },
          ]}
          rows={quote.lines.map((line) => ({
            id: line.id,
            cells: {
              item: (
                <>
                  {line.description}
                  <span className="docv-code">
                    {line.variantId ? codeOf.get(line.variantId) : isLineKind(line.kind) ? LINE_KIND_LABEL[line.kind] : line.kind}
                  </span>
                </>
              ),
              qty: line.quantity.toString(),
              price: docMoney(line.unitPrice, quote.currency),
              discount: D(line.discountAmount).gt(0) ? docMoney(line.discountAmount, quote.currency) : "—",
              total: docMoney(line.lineTotal, quote.currency),
            },
          }))}
          totals={[
            { label: "ქვეჯამი", value: docMoney(gross, quote.currency) },
            ...(discount.gt(0) ? [{ label: "ფასდაკლება", value: `−${docMoney(discount, quote.currency)}` }] : []),
            { label: "ჯამი", value: docMoney(total, quote.currency), strong: true },
          ]}
        />
        <DocSection title="ისტორია">
          <ol className="docv-timeline">
            {timeline.map((event) => (
              <li key={event.id}>
                <strong>{EVENT_LABEL[event.action] ?? event.action}</strong>
                <span>
                  {formatInTimeZone(event.createdAt, BUSINESS_TIME_ZONE, "dd.MM.yyyy HH:mm")}
                  {event.actorId && userName.get(event.actorId) ? ` · ${userName.get(event.actorId)}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </DocSection>
      </div>
    </section>
  );
}
