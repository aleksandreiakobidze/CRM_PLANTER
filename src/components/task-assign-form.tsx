import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { createTaskAction } from "@/server/actions/work-actions";

export function TaskAssignForm({
  members,
  actorId,
  customers,
  customerId,
}: {
  members: { id: string; name: string }[];
  actorId: string;
  customers?: { id: string; name: string }[];
  customerId?: string;
}) {
  return (
    <BoundForm action={createTaskAction} label="დავალების მიცემა">
      {customerId ? <input type="hidden" name="customerId" value={customerId} /> : null}
      <label>სათაური<input name="title" required placeholder="რა უნდა გაკეთდეს" /></label>
      <label>ვადა<input name="dueOn" type="date" /></label>
      {customers ? (
        <label>კლიენტი
          <ComboBox name="customerId" options={[{ value: "", label: "კლიენტის გარეშე" }, ...customers.map((customer) => ({ value: customer.id, label: customer.name }))]} defaultValue="" />
        </label>
      ) : null}
      <label>აღწერა<textarea name="description" placeholder="რა არის გასაკეთებელი" /></label>
      <fieldset className="people">
        <legend>თანამშრომლები</legend>
        {members.map((member) => (
          <label key={member.id}>
            <input type="checkbox" name="assigneeIds" value={member.id} defaultChecked={member.id === actorId} />
            {member.name}
          </label>
        ))}
      </fieldset>
      <label>ფაილები<input name="files" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.doc,.docx,.xls,.xlsx" /></label>
    </BoundForm>
  );
}
