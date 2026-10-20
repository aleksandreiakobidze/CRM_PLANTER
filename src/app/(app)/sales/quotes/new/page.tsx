import Link from "next/link";
import { HeaderLinesForm } from "@/components/header-lines-form";
import { createQuoteAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function NewQuotePage() {
  const actor = await getActor();
  const [customers, variants] = await Promise.all([
    getDb().customer.findMany({ where: { organizationId: actor.organizationId, mergedIntoId: null }, orderBy: { name: "asc" } }),
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId, active: true }, orderBy: { sku: "asc" } }),
  ]);
  return (
    <section className="grid doc">
      <div className="page-head">
        <Link className="back" href="/sales/quotes">შეთავაზებები</Link>
        <h1>ახალი შეთავაზება</h1>
        <p>შენახვა ნაშთს არ ჩამოწერს და არ ჯავშნის. აითემი კატალოგიდან ირჩევა.</p>
      </div>
      <div className="card doc-card">
        <HeaderLinesForm
          action={createQuoteAction}
          label="შენახვა"
          mode="sale"
          partyName="customerId"
          partyLabel="კლიენტი"
          parties={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
          items={variants.map((variant) => ({ value: variant.id, label: `${variant.sku} — ${variant.nameKa}`, price: variant.listPrice.toString() }))}
          extra={<label>შენიშვნა<textarea name="notes" /></label>}
        />
      </div>
    </section>
  );
}
