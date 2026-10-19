import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
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
    <section className="card">
      <h1>ახალი შეთავაზება</h1>
      <p>შენახვა ნაშთს არ ჩამოწერს და არ ჯავშნის.</p>
      <BoundForm action={createQuoteAction} label="შენახვა">
        <label>კლიენტი
          <ComboBox name="customerId" required options={customers.map((customer) => ({ value: customer.id, label: customer.name }))} />
        </label>
        <label>ვარიანტი
          <ComboBox name="variantId" required options={variants.map((variant) => ({ value: variant.id, label: `${variant.sku} — ${variant.listPrice.toString()} ₾` }))} />
        </label>
        <label>რაოდენობა<input name="quantity" required defaultValue="1" /></label>
        <label>ერთეულის ფასი<input name="unitPrice" placeholder="ცარიელი = კატალოგის snapshot" /></label>
        <label>ფასდაკლება<input name="discountAmount" defaultValue="0" /></label>
        <label>შენიშვნა<textarea name="notes" /></label>
      </BoundForm>
    </section>
  );
}
