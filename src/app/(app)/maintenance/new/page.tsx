import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { customerOption } from "@/lib/customer-option";
import { createContractAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function NewContractPage() {
  const actor = await getActor();
  const customers = await getDb().customer.findMany({ where: { organizationId: actor.organizationId, mergedIntoId: null } });
  return (
    <section className="card">
      <h1>მოვლის ხელშეკრულება</h1>
      <p>საწყისი წესია ფასდაუკლებელი ღირებულების 10%. 1000 ₾ ბაზა იძლევა 100 ₾-ს, არა ფასდაკლებულ გაყიდვას.</p>
      <BoundForm action={createContractAction} label="შენახვა">
        <label>კლიენტი<ComboBox name="customerId" options={customers.map(customerOption)} /></label>
        <label>დაწყება<input name="startOn" type="date" required /></label>
        <label>პროცენტი<input name="percent" defaultValue="10" /></label>
        <label>აღწერა<input name="description" defaultValue="მცენარეების ნაკრები" /></label>
        <label>რაოდენობა<input name="quantity" defaultValue="1" /></label>
        <label>ფასდაუკლებელი ერთეულის ფასი<input name="referenceUnitPrice" required /></label>
      </BoundForm>
    </section>
  );
}
