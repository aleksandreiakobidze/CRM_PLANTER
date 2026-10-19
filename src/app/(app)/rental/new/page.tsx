import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { bookRentalAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function NewRentalPage() {
  const actor = await getActor();
  const [customers, assets] = await Promise.all([
    getDb().customer.findMany({ where: { organizationId: actor.organizationId, mergedIntoId: null } }),
    getDb().rentalAsset.findMany({ where: { organizationId: actor.organizationId, status: "available" } }),
  ]);
  return (
    <section className="card">
      <h1>გაქირავების ჯავშანი</h1>
      <p>21–23 ნოემბერი ითვლება 3 დღედ. დეპოზიტი შემოსავალი არ არის.</p>
      <BoundForm action={bookRentalAction} label="დაჯავშნა">
        <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
        <label>კლიენტი<ComboBox name="customerId" options={customers.map((customer) => ({ value: customer.id, label: customer.name }))} /></label>
        <label>მცენარე<ComboBox name="assetId" options={assets.map((asset) => ({ value: asset.id, label: asset.code }))} /></label>
        <label>დაწყება<input name="startOn" type="date" required /></label>
        <label>დასრულება<input name="endOn" type="date" required /></label>
        <label>ჯამი ₾<input name="total" required /></label>
        <label>დეპოზიტი<input name="depositAmount" defaultValue="0" /></label>
      </BoundForm>
    </section>
  );
}
