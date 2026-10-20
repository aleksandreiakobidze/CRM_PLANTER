import Link from "next/link";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
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
    <section className="card">
      <div className="page-head">
        <Link className="back" href="/purchases">შესყიდვები</Link>
        <h1>ახალი შესყიდვა</h1>
        <p>დრაფტი მარაგს არ ზრდის. მიღება ცალკე გატარდება.</p>
      </div>
      {suppliers.length === 0 ? <p className="err">ჯერ დაამატეთ მიმწოდებელი შესყიდვების გვერდზე.</p> : (
        <BoundForm action={createPurchaseOrderAction} label="შენახვა">
          <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
          <label>მიმწოდებელი
            <ComboBox name="supplierId" required options={suppliers.map((item) => ({ value: item.id, label: item.name }))} />
          </label>
          <label>ვარიანტი
            <ComboBox name="variantId" required options={variants.map((item) => ({ value: item.id, label: `${item.sku} — ${item.nameKa}` }))} />
          </label>
          <label>რაოდენობა<input name="quantity" required defaultValue="1" /></label>
          <label>ერთეულის ფასი<input name="unitPrice" required defaultValue="0" /></label>
          <label>მოსალოდნელი თარიღი<input name="expectedOn" type="date" /></label>
          <label>შენიშვნა<textarea name="notes" /></label>
        </BoundForm>
      )}
    </section>
  );
}
