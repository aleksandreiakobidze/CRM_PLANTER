import Link from "next/link";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { HeaderLinesForm } from "@/components/header-lines-form";
import { RecordList } from "@/components/record-list";
import { RsFields } from "@/components/rs-fields";
import { variantLabel } from "@/lib/variant-label";
import { completeInternalAction } from "@/server/actions/waybill-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { tbilisiDateString } from "@/server/time";

export default async function WaybillPage() {
  const actor = await getActor();
  const [locations, variants, shipments, organization] = await Promise.all([
    getDb().location.findMany({ where: { organizationId: actor.organizationId }, orderBy: { nameKa: "asc" } }),
    getDb().productVariant.findMany({ where: { organizationId: actor.organizationId, active: true }, orderBy: { sku: "asc" } }),
    getDb().internalShipment.findMany({
      where: { organizationId: actor.organizationId },
      include: { fromLocation: true, toLocation: true },
      orderBy: { createdAt: "desc" },
    }),
    getDb().organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
  ]);
  return (
    <section className="grid doc">
      <div className="page-head">
        <Link className="back" href="/inventory">მარაგი</Link>
        <h1>შიდა გადაზიდვა</h1>
        <p>იგივე RS ველები, რაც გაყიდვის ზედნადებზე. დასრულება მარაგს ერთხელ გადაიტანს და ინვოისს არ ქმნის.</p>
      </div>
      <div className="card doc-card">
        <HeaderLinesForm
          action={completeInternalAction}
          label="დასრულება"
          mode="stock"
          items={variants.map((variant) => ({ value: variant.id, label: variantLabel(variant), price: variant.listPrice.toString() }))}
          extra={
            <>
              <label>საიდან<ComboBox name="fromLocationId" required options={locations.map((location) => ({ value: location.id, label: location.nameKa }))} /></label>
              <label>სად<ComboBox name="toLocationId" required defaultValue={locations[1]?.id ?? locations[0]?.id} options={locations.map((location) => ({ value: location.id, label: location.nameKa }))} /></label>
              <RsFields beginDefault={tbilisiDateString()} values={{ startAddress: organization.address ?? "" }} />
            </>
          }
        />
      </div>
      <RecordList
        storageKey="waybills"
        empty="შიდა გადაზიდვა ჯერ არ არის."
        columns={[
          { key: "number", header: "ნომერი" },
          { key: "route", header: "გზა" },
          { key: "status", header: "სტატუსი" },
          { key: "rs", header: "RS" },
        ]}
        rows={shipments.map((shipment) => ({
          id: shipment.id,
          cells: {
            number: <Link href={`/inventory/waybill/${shipment.id}`}>{shipment.number}</Link>,
            route: `${shipment.fromLocation.nameKa} → ${shipment.toLocation.nameKa}`,
            status: shipment.status === "completed" ? "დასრულებული" : "RS შეცდომა",
            rs: shipment.rsWaybillNumber || shipment.rsError || "—",
          },
        }))}
      />
    </section>
  );
}
