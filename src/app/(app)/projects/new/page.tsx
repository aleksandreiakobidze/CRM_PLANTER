import Link from "next/link";
import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { customerOption } from "@/lib/customer-option";
import { createProjectAction } from "@/server/actions/ops-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function NewProjectPage() {
  const actor = await getActor();
  const customers = await getDb().customer.findMany({
    where: { organizationId: actor.organizationId, mergedIntoId: null },
    orderBy: { name: "asc" },
  });
  return (
    <section className="card">
      <div className="page-head">
        <Link className="back" href="/projects">გამწვანება</Link>
        <h1>ახალი პროექტი</h1>
        <p>დათვალიერების შენიშვნა, სინათლე და ბიუჯეტის ხაზი. ფაქტი ცალკე Expense-ით იწერება.</p>
      </div>
      <BoundForm action={createProjectAction} label="შენახვა">
        <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
        <label>კლიენტი
          <ComboBox name="customerId" required options={customers.map(customerOption)} />
        </label>
        <label>ობიექტი / ზომები<textarea name="siteNotes" /></label>
        <label>სინათლე<textarea name="lightNotes" /></label>
        <label>ხაზის ტიპი
          <ComboBox
            name="kind"
            options={[
              { value: "material", label: "მასალა" },
              { value: "labor", label: "სამუშაო" },
              { value: "transport", label: "ტრანსპორტი" },
            ]}
          />
        </label>
        <label>აღწერა<input name="description" required /></label>
        <label>რაოდენობა<input name="quantity" defaultValue="1" /></label>
        <label>თანხა<input name="amount" required defaultValue="0" /></label>
      </BoundForm>
    </section>
  );
}
