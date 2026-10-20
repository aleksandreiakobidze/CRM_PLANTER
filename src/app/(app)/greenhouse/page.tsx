import Link from "next/link";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { RecordList } from "@/components/record-list";
import { createBatchAction, repotAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { formatDateOnly } from "@/server/time";

const STAGE: Record<string, string> = {
  received: "მიღებული",
  growing: "იზრდება",
  ready: "მზად არის",
  closed: "დახურული",
};

export default async function GreenhousePage() {
  const actor = await getActor();
  const [batches, variants, suppliers, locations] = await Promise.all([
    getDb().growthBatch.findMany({
      where: { organizationId: actor.organizationId },
      include: { variant: true, location: true },
      orderBy: { createdAt: "desc" },
    }),
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId, active: true }, orderBy: { sku: "asc" } }),
    getDb().supplier.findMany({ where: { organizationId: actor.organizationId }, orderBy: { name: "asc" } }),
    getDb().location.findMany({ where: { organizationId: actor.organizationId }, orderBy: { code: "asc" } }),
  ]);
  const variantOptions = variants.map((item) => ({ value: item.id, label: `${item.sku} — ${item.nameKa}` }));
  const greenhouse = locations.find((item) => item.code === "greenhouse") ?? locations[0];
  return (
    <section className="grid">
      <div className="page-head">
        <h1>სათბური</h1>
        <p>პარტია ზრდის ეტაპს იცვლის, გაყიდვად ერთეულს ავტომატურად არ ამრავლებს.</p>
      </div>
      <div className="card">
        <h2>ახალი პარტია</h2>
        <BoundForm action={createBatchAction} label="შენახვა">
          <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
          <label>ვარიანტი<ComboBox name="variantId" required options={variantOptions} /></label>
          <label>ლოკაცია
            <ComboBox name="locationId" options={locations.map((item) => ({ value: item.id, label: item.nameKa }))} defaultValue={greenhouse?.id} />
          </label>
          {suppliers.length > 0 ? (
            <label>მიმწოდებელი
              <ComboBox name="supplierId" options={[{ value: "", label: "—" }, ...suppliers.map((item) => ({ value: item.id, label: item.name }))]} />
            </label>
          ) : null}
          <label>რაოდენობა<input name="quantity" required /></label>
          <label>დაგეგმილი მზადყოფნა<input name="expectedReadyOn" type="date" /></label>
          <label>შენიშვნა<textarea name="notes" /></label>
        </BoundForm>
      </div>
      <div className="card">
        <h2>გადარგვა</h2>
        <p>ძველი ვარიანტი და ქოთანი იხარჯება, ახალი ნაშთი იწერება ხარჯით.</p>
        <BoundForm action={repotAction} label="გადარგვა">
          <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
          <label>ძველი ვარიანტი<ComboBox name="fromVariantId" required options={variantOptions} /></label>
          <label>ახალი ვარიანტი<ComboBox name="toVariantId" required options={variantOptions} /></label>
          <label>ქოთანი / მასალა<ComboBox name="potVariantId" required options={variantOptions} /></label>
          <label>ლოკაცია
            <ComboBox name="locationId" required options={locations.map((item) => ({ value: item.id, label: item.nameKa }))} defaultValue={greenhouse?.id} />
          </label>
          <label>მცენარე<input name="plantQty" required defaultValue="1" /></label>
          <label>ქოთანი<input name="potQty" required defaultValue="1" /></label>
        </BoundForm>
      </div>
      <RecordList
        storageKey="greenhouse"
        empty="პარტია ჯერ არ არის."
        columns={[
          { key: "number", header: "ნომერი" },
          { key: "sku", header: "SKU" },
          { key: "stage", header: "ეტაპი" },
          { key: "qty", header: "რაოდენობა" },
          { key: "ready", header: "მზადყოფნა" },
        ]}
        rows={batches.map((batch) => ({
          id: batch.id,
          cells: {
            number: <Link href={`/greenhouse/${batch.id}`}>{batch.number}</Link>,
            sku: batch.variant.sku,
            stage: STAGE[batch.stage] ?? batch.stage,
            qty: batch.quantity.toString(),
            ready: batch.expectedReadyOn ? formatDateOnly(batch.expectedReadyOn) : "—",
          },
        }))}
      />
    </section>
  );
}
