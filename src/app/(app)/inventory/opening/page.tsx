import Link from "next/link";
import { ComboBox } from "@/components/combo-box";
import { HeaderLinesForm } from "@/components/header-lines-form";
import { variantLabel } from "@/lib/variant-label";
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
    <section className="grid doc">
      <div className="page-head">
        <Link className="back" href="/inventory">მარაგი</Link>
        <h1>საწყისი ნაშთი</h1>
        <p>ყველა ხაზი ერთ დოკუმენტად და ერთ ტრანზაქციაში გატარდება. იგივე დოკუმენტი მეორედ არ გაორმაგდება.</p>
      </div>
      <div className="card doc-card">
        <HeaderLinesForm
          action={openingStockAction}
          label="გატარება"
          mode="purchase"
          items={variants.map((variant) => ({ value: variant.id, label: variantLabel(variant), price: variant.unitCost.toString() }))}
          posting={{ pickLabels: { locationId: "ლოკაცია" } }}
          extra={
            <div className="docv-fields">
              <label>ლოკაცია
                <ComboBox name="locationId" required options={locations.map((location) => ({ value: location.id, label: location.nameKa }))} />
              </label>
              <label>შენიშვნა<input name="note" placeholder="მაგ. ინვენტარიზაცია 2026" /></label>
            </div>
          }
        />
      </div>
      <p className="muted"><Link href="/inventory/movements?type=opening">გატარებული საწყისი ნაშთები →</Link></p>
    </section>
  );
}
