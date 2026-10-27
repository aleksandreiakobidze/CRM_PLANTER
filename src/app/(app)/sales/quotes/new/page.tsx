import Link from "next/link";
import { HeaderLinesForm } from "@/components/header-lines-form";
import { customerOption } from "@/lib/customer-option";
import { variantLabel } from "@/lib/variant-label";
import { createQuoteAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { addDaysIso, tbilisiDateString } from "@/server/time";

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const actor = await getActor();
  const { customerId } = await searchParams;
  const [customers, variants] = await Promise.all([
    getDb().customer.findMany({ where: { organizationId: actor.organizationId, mergedIntoId: null }, orderBy: { name: "asc" } }),
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId, active: true }, orderBy: { sku: "asc" } }),
  ]);
  return (
    <section className="grid doc">
      <div className="page-head">
        <Link className="back" href="/sales/quotes">შეთავაზებები</Link>
        <h1>ახალი შეთავაზება</h1>
        <p>შენახვა ნაშთს არ ჩამოწერს. შეიძლება აითემი, ექსკურსია, გამწვანება, გადარგვა, მოვლა ან სხვა სერვისი.</p>
      </div>
      <div className="card doc-card">
        <HeaderLinesForm
          action={createQuoteAction}
          label="დრაფტის შენახვა"
          mode="sale"
          partyName="customerId"
          partyLabel="კლიენტი"
          partyDefault={customers.some((item) => item.id === customerId) ? customerId : undefined}
          parties={customers.map(customerOption)}
          items={variants.map((variant) => ({ value: variant.id, label: variantLabel(variant), price: variant.listPrice.toString() }))}
          extra={
            <div className="docv-fields">
              <label>მოქმედების ვადა<input name="validUntil" type="date" defaultValue={addDaysIso(tbilisiDateString(), 14)} /></label>
              <label>შენიშვნა<input name="notes" /></label>
            </div>
          }
        />
      </div>
    </section>
  );
}
