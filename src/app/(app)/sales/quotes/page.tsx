import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { ComboBox } from "@/components/combo-box";
import { docDate, docMoney } from "@/components/doc-view";
import { RecordList } from "@/components/record-list";
import { Badge } from "@/components/ui/badge";
import { customerOption } from "@/lib/customer-option";
import { getActor } from "@/server/auth/session";
import { contains, getDb } from "@/server/db";
import { docStatus } from "@/server/labels";
import { D } from "@/server/money";
import { tbilisiDateString } from "@/server/time";

const TABS = [
  { code: "", label: "ყველა" },
  { code: "draft", label: "დრაფტი" },
  { code: "sent", label: "გაგზავნილი" },
  { code: "accepted", label: "მიღებული" },
  { code: "converted", label: "შეკვეთა გახდა" },
  { code: "declined", label: "უარყოფილი" },
];
const PAGE_SIZE = 50;

type Search = { status?: string; q?: string; customerId?: string; page?: string };

function href(current: Search, patch: Partial<Search>) {
  const params = new URLSearchParams();
  const next = { ...current, ...patch };
  for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `/sales/quotes?${query}` : "/sales/quotes";
}

export default async function QuotesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await getActor();
  const search = await searchParams;
  const status = TABS.some((tab) => tab.code === search.status) ? (search.status ?? "") : "";
  const q = search.q?.trim() ?? "";
  const page = Math.max(1, Number(search.page) || 1);
  const base: Prisma.QuoteWhereInput = {
    organizationId: actor.organizationId,
    ...(search.customerId ? { customerId: search.customerId } : {}),
    ...(q
      ? { OR: [{ number: contains(q) }, { customer: { name: contains(q) } }, { notes: contains(q) }] }
      : {}),
  };
  const where: Prisma.QuoteWhereInput = status ? { ...base, status } : base;
  const [quotes, total, counts, customers] = await Promise.all([
    getDb().quote.findMany({
      where,
      include: { customer: true, lines: { select: { lineTotal: true } }, order: { select: { id: true, number: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    getDb().quote.count({ where }),
    getDb().quote.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    getDb().customer.findMany({
      where: { organizationId: actor.organizationId, mergedIntoId: null, quotes: { some: {} } },
      orderBy: { name: "asc" },
    }),
  ]);
  const countOf = new Map(counts.map((row) => [row.status, row._count._all]));
  const all = counts.reduce((sum, row) => sum + row._count._all, 0);
  const today = tbilisiDateString();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="grid doc">
      <div className="row">
        <h1>შეთავაზებები</h1>
        <div className="actions">
          <Link className="button secondary" href="/export/quotes">Excel</Link>
          <Link className="button" href="/sales/quotes/new">ახალი შეთავაზება</Link>
        </div>
      </div>
      <nav className="doc-tabs" aria-label="სტატუსი">
        {TABS.map((tab) => (
          <Link key={tab.code || "all"} href={href(search, { status: tab.code || undefined, page: undefined })} aria-current={status === tab.code ? "page" : undefined}>
            {tab.label}
            <span>{tab.code ? (countOf.get(tab.code) ?? 0) : all}</span>
          </Link>
        ))}
      </nav>
      <form className="doc-filters" action="/sales/quotes">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <label>ძებნა<input name="q" defaultValue={q} placeholder="ნომერი, კლიენტი ან შენიშვნა" /></label>
        <label>კლიენტი
          <ComboBox name="customerId" defaultValue={search.customerId} options={[{ value: "", label: "ყველა კლიენტი" }, ...customers.map(customerOption)]} />
        </label>
        <button type="submit" className="secondary">გაფილტვრა</button>
        {q || search.customerId ? <Link className="button secondary" href={href({ status }, {})}>გასუფთავება</Link> : null}
      </form>
      <RecordList
        storageKey="quotes"
        empty="შეთავაზება ვერ მოიძებნა."
        columns={[
          { key: "number", header: "ნომერი" },
          { key: "customer", header: "კლიენტი" },
          { key: "date", header: "თარიღი" },
          { key: "valid", header: "ვადა" },
          { key: "status", header: "სტატუსი" },
          { key: "order", header: "შეკვეთა" },
          { key: "total", header: "ჯამი" },
        ]}
        rows={quotes.map((quote) => {
          const badge = docStatus("quote", quote.status);
          const validIso = quote.validUntil?.toISOString().slice(0, 10);
          const expired = Boolean(validIso && validIso < today && ["draft", "sent"].includes(quote.status));
          return {
            id: quote.id,
            cells: {
              number: <Link href={`/sales/quotes/${quote.id}`}>{quote.number}</Link>,
              customer: <Link href={`/crm/customers/${quote.customerId}`}>{quote.customer.name}</Link>,
              date: docDate(quote.createdAt, true),
              valid: expired ? <span className="err">{docDate(quote.validUntil)}</span> : docDate(quote.validUntil),
              status: <Badge variant={badge.tone}>{badge.label}</Badge>,
              order: quote.order ? <Link href={`/sales/orders/${quote.order.id}`}>{quote.order.number}</Link> : "—",
              total: docMoney(quote.lines.reduce((sum, line) => sum.plus(D(line.lineTotal)), D(0)), quote.currency),
            },
          };
        })}
      />
      {pages > 1 ? (
        <nav className="doc-tabs" aria-label="გვერდები">
          {page > 1 ? <Link href={href(search, { page: String(page - 1) })}>წინა</Link> : null}
          <span className="muted">{page} / {pages} · სულ {total}</span>
          {page < pages ? <Link href={href(search, { page: String(page + 1) })}>შემდეგი</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}
