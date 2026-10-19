import Link from "next/link";
import { getActor } from "@/server/auth/session";
import { searchRecords } from "@/server/features/crm/customer-service";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await getActor();
  const { q = "" } = await searchParams;
  const result = await searchRecords(actor, q);
  const empty = result.customers.length + result.variants.length + result.orders.length + result.invoices.length === 0;
  return (
    <section className="grid">
      <div className="page-head">
        <h1>{q ? `ძებნა: ${q}` : "ძებნა"}</h1>
        <p>სახელი, ტელეფონი, SKU ან დოკუმენტის ნომერი.</p>
      </div>
      {empty ? <p className="card">ვერაფერი მოიძებნა. სცადეთ სახელი, ტელეფონი, SKU ან დოკუმენტის ნომერი.</p> : null}
      {result.customers.length > 0 ? (
        <div className="grid">
          <h2>კლიენტები</h2>
          <div className="results">
            {result.customers.map((customer) => (
              <Link key={customer.id} href={`/crm/customers/${customer.id}`}>{customer.name}<small>{[customer.venueType, customer.district].filter(Boolean).join(" · ") || "კლიენტი"}</small></Link>
            ))}
          </div>
        </div>
      ) : null}
      {result.variants.length > 0 ? (
        <div className="grid">
          <h2>პროდუქტები</h2>
          <div className="results">
            {result.variants.map((variant) => (
              <Link key={variant.id} href={`/products?q=${encodeURIComponent(variant.sku)}`}>{variant.sku} · {variant.nameKa}<small>პროდუქტი</small></Link>
            ))}
          </div>
        </div>
      ) : null}
      {result.orders.length > 0 ? (
        <div className="grid">
          <h2>შეკვეთები</h2>
          <div className="results">
            {result.orders.map((order) => (
              <Link key={order.id} href={`/sales/orders/${order.id}`}>{order.number}<small>შეკვეთა</small></Link>
            ))}
          </div>
        </div>
      ) : null}
      {result.invoices.length > 0 ? (
        <div className="grid">
          <h2>ინვოისები</h2>
          <div className="results">
            {result.invoices.map((invoice) => (
              <Link key={invoice.id} href={`/finance/invoices/${invoice.id}`}>{invoice.number ?? "Draft"}<small>ინვოისი</small></Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
