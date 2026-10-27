import Link from "next/link";
import { HeaderLinesForm } from "@/components/header-lines-form";
import { customerOption } from "@/lib/customer-option";
import { variantLabel } from "@/lib/variant-label";
import { createSalesOrderAction } from "@/server/actions/waybill-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { tbilisiDateString } from "@/server/time";

export default async function NewOrderPage() {
  const actor = await getActor();
  const [customers, variants] = await Promise.all([
    getDb().customer.findMany({ where: { organizationId: actor.organizationId, mergedIntoId: null }, orderBy: { name: "asc" } }),
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId, active: true }, orderBy: { sku: "asc" } }),
  ]);
  return (
    <section className="grid doc">
      <div className="page-head">
        <Link className="back" href="/sales/orders">შეკვეთები</Link>
        <h1>ახალი შეკვეთა</h1>
        <p>შენახვა ნაშთს არ ჩამოწერს. ავტორიზება რეზერვავს.</p>
      </div>
      <div className="card doc-card">
        <HeaderLinesForm
          action={createSalesOrderAction}
          label="შენახვა"
          mode="sale"
          partyName="customerId"
          partyLabel="კლიენტი"
          parties={customers.map(customerOption)}
          items={variants.map((variant) => ({ value: variant.id, label: variantLabel(variant), price: variant.listPrice.toString() }))}
          extra={
            <>
              <label>თარიღი<input name="orderedOn" type="date" required defaultValue={tbilisiDateString()} /></label>
              <label>შენიშვნა<textarea name="notes" /></label>
            </>
          }
        />
      </div>
    </section>
  );
}
