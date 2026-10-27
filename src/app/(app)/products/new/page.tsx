import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { createVariantAction } from "@/server/actions/work-actions";

const CATEGORIES = [
  { value: "plant", label: "მცენარე" },
  { value: "pot", label: "ქოთანი" },
  { value: "soil", label: "მიწა/სუბსტრატი" },
  { value: "service", label: "მომსახურება" },
];
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function NewProductPage() {
  const actor = await getActor();
  const species = await getDb().species.findMany({ where: { organizationId: actor.organizationId }, orderBy: { nameKa: "asc" } });
  return (
    <section className="card">
      <h1>ახალი პროდუქტი</h1>
      <BoundForm action={createVariantAction} label="შენახვა">
        <label>კატეგორია<ComboBox name="category" options={CATEGORIES} defaultValue="plant" /></label>
        <label>პროდუქტის სახელი<input name="productName" required /></label>
        <label>სახეობა
          <ComboBox name="speciesId" options={[{ value: "", label: "—" }, ...species.map((item) => ({ value: item.id, label: item.nameKa }))]} defaultValue="" />
        </label>
        <label>ვარიანტი<input name="variantName" required /></label>
        <label>SKU<input name="sku" placeholder="ცარიელი — გამოიყენება შიდა კოდი" /></label>
        <p className="muted">შიდა კოდი (PL-XXXXXX) ავტომატურად მიენიჭება შენახვისას.</p>
        <label>საცალო ფასი<input name="listPrice" required defaultValue="0" /></label>
        <label>ქოთნის მოცულობა, ლ<input name="potVolumeLiters" /></label>
        <label>მოვლის შენიშვნა<textarea name="careNotes" placeholder="ცარიელი დარჩეს, თუ ფაქტი არ იცით" /></label>
      </BoundForm>
    </section>
  );
}
