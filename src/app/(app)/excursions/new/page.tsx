import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { customerOption } from "@/lib/customer-option";
import { bookExcursionAction } from "@/server/actions/work-actions";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";

export default async function NewExcursionPage() {
  const actor = await getActor();
  const [customers, resources] = await Promise.all([
    getDb().customer.findMany({ where: { organizationId: actor.organizationId, mergedIntoId: null } }),
    getDb().resource.findMany({ where: { organizationId: actor.organizationId } }),
  ]);
  return (
    <section className="card">
      <h1>ექსკურსიის ჯავშანი</h1>
      <BoundForm action={bookExcursionAction} label="დაჯავშნა">
        <input type="hidden" name="postingKey" value={crypto.randomUUID()} />
        <label>სკოლა<ComboBox name="customerId" options={customers.map(customerOption)} /></label>
        <label>სივრცე<ComboBox name="resourceId" options={resources.map((resource) => ({ value: resource.id, label: resource.nameKa }))} /></label>
        <label>თარიღი<input name="date" type="date" required /></label>
        <label>დაწყება<input name="startTime" defaultValue="13:00" /></label>
        <label>დასრულება<input name="endTime" defaultValue="15:00" /></label>
        <label>ბავშვები<input name="plannedChildren" defaultValue="20" /></label>
        <label>შენიშვნა<textarea name="note" required /></label>
        <label>ფასი<input name="price" required inputMode="decimal" /></label>
        <label><input type="checkbox" name="windowException" value="yes" /> ადმინისტრატორის გამონაკლისი ფანჯარაზე</label>
      </BoundForm>
    </section>
  );
}
