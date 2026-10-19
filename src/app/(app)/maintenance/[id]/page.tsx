import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { activateContractAction, amendContractAction, billContractAction, replacePlantAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { contractFee } from "@/server/features/maintenance/maintenance-service";
import { monthKey } from "@/server/time";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const contract = await getDb().maintenanceContract.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: { lines: true, customer: true, plants: true },
  });
  if (!contract) notFound();
  const fee = await contractFee(contract.id);
  const locations = await getDb().location.findMany({ where: { organizationId: actor.organizationId } });
  const variants = await getDb().productVariant.findMany({ where: { organizationId: actor.organizationId } });
  return (
    <section className="grid">
      <div className="page-head">
        <Link className="back" href="/maintenance">მოვლა</Link>
        <h1>{contract.number}</h1>
        <p>{contract.customer.name} · {contract.status} · ბაზა {fee.base} ₾ · თვე {fee.fee} ₾</p>
      </div>
      <ul>{contract.lines.map((line) => <li key={line.id}>{line.description} × {line.quantity.toString()} @ {line.referenceUnitPrice.toString()} {line.active ? "აქტიური" : "ჩანაცვლებული"}</li>)}</ul>
      {contract.status === "draft" ? <form action={activateContractAction.bind(null, contract.id)}><button type="submit">აქტივაცია</button></form> : null}
      {contract.status === "active" ? <form action={billContractAction.bind(null, contract.id, monthKey())}><button type="submit">ამ თვის draft დარიცხვა</button></form> : null}
      <div className="card">
        <h2>სამომავლო ცვლილება</h2>
        <BoundForm action={amendContractAction.bind(null, contract.id)} label="შენახვა">
          <label>ძალაში შესვლა<input name="effectiveOn" type="date" required /></label>
          <label>პროცენტი<input name="percent" required /></label>
          <label>შენიშვნა<input name="note" defaultValue="შეთანხმებული ცვლილება" /></label>
        </BoundForm>
      </div>
      {contract.plants.filter((plant) => plant.status === "active").map((plant) => (
        <div className="card" key={plant.id}>
          <h2>ჩანაცვლება: {plant.description}</h2>
          <BoundForm action={replacePlantAction.bind(null, plant.id)} label="ჩანაცვლების გატარება">
            <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
            <label>ვარიანტი<ComboBox name="variantId" options={variants.map((variant) => ({ value: variant.id, label: variant.sku }))} /></label>
            <label>საწყობი<ComboBox name="locationId" options={locations.map((location) => ({ value: location.id, label: location.nameKa }))} /></label>
          </BoundForm>
        </div>
      ))}
    </section>
  );
}
