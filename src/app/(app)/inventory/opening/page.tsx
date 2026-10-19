import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { openingStockAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function OpeningPage() {
  const actor = await getActor();
  const [variants, locations] = await Promise.all([
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId }, orderBy: { sku: "asc" } }),
    getDb().location.findMany({ where: { organizationId: actor.organizationId }, orderBy: { code: "asc" } }),
  ]);
  return (
    <section className="card">
      <h1>საწყისი ნაშთი</h1>
      <p>შეტანა იწერება opening მოძრაობად. იგივე გასაღებით მეორედ არ გაორმაგდება.</p>
      <BoundForm action={openingStockAction} label="გატარება">
        <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
        <label>ვარიანტი
          <ComboBox name="variantId" required options={variants.map((variant) => ({ value: variant.id, label: `${variant.sku} — ${variant.nameKa}` }))} />
        </label>
        <label>ლოკაცია
          <ComboBox name="locationId" required options={locations.map((location) => ({ value: location.id, label: location.nameKa }))} />
        </label>
        <label>რაოდენობა<input name="quantity" required /></label>
        <label>თვითღირებულება<input name="unitCost" defaultValue="0" /></label>
      </BoundForm>
    </section>
  );
}
