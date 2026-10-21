import Link from "next/link";
import { HeaderLinesForm } from "@/components/header-lines-form";
import { customerOption } from "@/lib/customer-option";
import { bookRentalAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function NewRentalPage() {
  const actor = await getActor();
  const [customers, assets] = await Promise.all([
    getDb().customer.findMany({ where: { organizationId: actor.organizationId, mergedIntoId: null }, orderBy: { name: "asc" } }),
    getDb().rentalAsset.findMany({ where: { organizationId: actor.organizationId, status: "available" }, include: { variant: true } }),
  ]);
  return (
    <section className="grid doc">
      <div className="page-head">
        <Link className="back" href="/rental">გაქირავება</Link>
        <h1>გაქირავების ჯავშანი</h1>
        <p>21–23 ნოემბერი ითვლება 3 დღედ. დეპოზიტი შემოსავალი არ არის. თითო მცენარეს საკუთარი ფასი აქვს.</p>
      </div>
      <div className="card doc-card">
        <HeaderLinesForm
          action={bookRentalAction}
          label="დაჯავშნა"
          mode="rental"
          partyName="customerId"
          partyLabel="კლიენტი"
          parties={customers.map(customerOption)}
          items={assets.map((asset) => ({
            value: asset.id,
            label: `${asset.code} — ${asset.variant.nameKa}`,
            price: asset.variant.listPrice.toString(),
          }))}
          extra={
            <>
              <label>დაწყება<input name="startOn" type="date" required /></label>
              <label>დასრულება<input name="endOn" type="date" required /></label>
              <label>დეპოზიტი<input name="depositAmount" defaultValue="0" /></label>
            </>
          }
        />
      </div>
    </section>
  );
}
