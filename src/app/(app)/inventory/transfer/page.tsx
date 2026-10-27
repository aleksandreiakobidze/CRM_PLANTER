import Link from "next/link";
import { ComboBox } from "@/components/combo-box";
import { HeaderLinesForm } from "@/components/header-lines-form";
import { variantLabel } from "@/lib/variant-label";
import { transferStockAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function TransferPage() {
  const actor = await getActor();
  const [variants, locations] = await Promise.all([
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId, active: true }, orderBy: { sku: "asc" } }),
    getDb().location.findMany({ where: { organizationId: actor.organizationId }, orderBy: { code: "asc" } }),
  ]);
  const options = locations.map((item) => ({ value: item.id, label: item.nameKa }));
  const from = locations.find((item) => item.code === "greenhouse") ?? locations[0];
  const to = locations.find((item) => item.code === "sales" && item.id !== from?.id) ?? locations.find((item) => item.id !== from?.id);
  return (
    <section className="grid doc">
      <div className="page-head">
        <Link className="back" href="/inventory">მარაგი</Link>
        <h1>გადატანა</h1>
        <p>ყველა ხაზის გასვლა და შემოსვლა ერთ დოკუმენტად იწერება. ნაშთი არ უნდა ჩავიდეს ნულს ქვემოთ. ისტორია არ იშლება.</p>
      </div>
      <div className="card doc-card">
        <HeaderLinesForm
          action={transferStockAction}
          label="გატარება"
          mode="stock"
          items={variants.map((variant) => ({ value: variant.id, label: variantLabel(variant) }))}
          posting={{ pickLabels: { fromLocationId: "საიდან", toLocationId: "სად" } }}
          extra={
            <div className="docv-fields">
              <label>საიდან<ComboBox name="fromLocationId" required options={options} defaultValue={from?.id} /></label>
              <label>სად<ComboBox name="toLocationId" required options={options} defaultValue={to?.id} /></label>
            </div>
          }
        />
      </div>
      <p className="muted"><Link href="/inventory/movements?type=transfer">გატარებული გადატანები →</Link></p>
    </section>
  );
}
