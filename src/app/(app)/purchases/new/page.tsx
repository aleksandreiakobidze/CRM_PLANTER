import Link from "next/link";
import { HeaderLinesForm } from "@/components/header-lines-form";
import { variantLabel } from "@/lib/variant-label";
import { createPurchaseOrderAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function NewPurchasePage() {
  const actor = await getActor();
  const [suppliers, variants] = await Promise.all([
    getDb().supplier.findMany({ where: { organizationId: actor.organizationId }, orderBy: { name: "asc" } }),
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId, active: true }, orderBy: { sku: "asc" } }),
  ]);
  return (
    <section className="grid doc">
      <div className="page-head">
        <Link className="back" href="/purchases">შესყიდვები</Link>
        <h1>ახალი შესყიდვა</h1>
        <p>დრაფტი მარაგს არ ზრდის. მიღება ცალკე გატარდება, ხაზების მიხედვით.</p>
      </div>
      {suppliers.length === 0 ? <p className="err">ჯერ დაამატეთ მიმწოდებელი შესყიდვების გვერდზე.</p> : (
        <div className="card doc-card">
          <HeaderLinesForm
            action={createPurchaseOrderAction}
            label="დრაფტის შენახვა"
            mode="purchase"
            partyName="supplierId"
            partyLabel="მიმწოდებელი"
            parties={suppliers.map((item) => ({ value: item.id, label: item.name }))}
            items={variants.map((variant) => ({ value: variant.id, label: variantLabel(variant), price: variant.unitCost.toString() }))}
            extra={
              <div className="docv-fields">
                <label>მოსალოდნელი თარიღი<input name="expectedOn" type="date" /></label>
                <label>შენიშვნა<input name="notes" /></label>
              </div>
            }
          />
        </div>
      )}
    </section>
  );
}
