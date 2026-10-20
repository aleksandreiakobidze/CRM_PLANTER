import Link from "next/link";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { transferStockAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function TransferPage() {
  const actor = await getActor();
  const [variants, locations] = await Promise.all([
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId, active: true }, orderBy: { sku: "asc" } }),
    getDb().location.findMany({ where: { organizationId: actor.organizationId }, orderBy: { code: "asc" } }),
  ]);
  return (
    <section className="card">
      <div className="page-head">
        <Link className="back" href="/inventory">მარაგი</Link>
        <h1>გადატანა</h1>
        <p>გასვლა და შემოსვლა ერთი posting key-ით იწერება. ისტორია არ იშლება.</p>
      </div>
      <BoundForm action={transferStockAction} label="გატარება">
        <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
        <label>ვარიანტი
          <ComboBox name="variantId" required options={variants.map((item) => ({ value: item.id, label: `${item.sku} — ${item.nameKa}` }))} />
        </label>
        <label>საიდან
          <ComboBox name="fromLocationId" required options={locations.map((item) => ({ value: item.id, label: item.nameKa }))} />
        </label>
        <label>სად
          <ComboBox name="toLocationId" required options={locations.map((item) => ({ value: item.id, label: item.nameKa }))} />
        </label>
        <label>რაოდენობა<input name="quantity" required /></label>
      </BoundForm>
    </section>
  );
}
