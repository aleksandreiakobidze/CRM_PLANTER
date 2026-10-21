"use client";

import { BoundForm } from "@/components/bound-form";
import { ComboBox, MultiSelect } from "@/components/combo-box";
import { Plus } from "@/components/icons";
import { customerOption, type CustomerOptionSource } from "@/lib/customer-option";
import { Button } from "@/components/ui/button";
import { createTaskAction } from "@/server/actions/work-actions";
import { useCallback, useState } from "react";

function PeoplePicker({ members, actorId }: { members: { id: string; name: string }[]; actorId: string }) {
  const defaultValue = members.some((member) => member.id === actorId)
    ? [actorId]
    : members[0]
      ? [members[0].id]
      : [];
  return (
    <label className="people-pick">
      თანამშრომლები
      <MultiSelect
        name="assigneeIds"
        label="თანამშრომლები"
        placeholder="სახელით ძებნა"
        min={1}
        defaultValue={defaultValue}
        options={members.map((member) => ({ value: member.id, label: member.name }))}
      />
    </label>
  );
}

function FileField() {
  const [names, setNames] = useState<string[]>([]);
  return (
    <div className="file-field">
      <div className="people-head">
        <span>ფაილები</span>
        <small>{names.length > 0 ? names.join(", ") : "ფაილი არ არის არჩეული"}</small>
      </div>
      <label className="file-trigger">
        <input
          name="files"
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.doc,.docx,.xls,.xlsx"
          onChange={(event) => setNames(Array.from(event.target.files ?? []).map((file) => file.name))}
        />
        <span>ფაილის არჩევა</span>
      </label>
    </div>
  );
}

export function TaskAssignForm({
  members,
  actorId,
  customers,
  customerId,
}: {
  members: { id: string; name: string }[];
  actorId: string;
  customers?: CustomerOptionSource[];
  customerId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const closeAfterCreate = useCallback(() => {
    setOpen(false);
    setNotice("დავალება შეიქმნა");
  }, []);

  if (members.length === 0) return null;

  return (
    <div className={open ? "task-composer open w-full basis-full" : "task-composer"}>
      {open ? (
        <section className="task-sheet">
          <div className="task-sheet-head">
            <h2>ახალი დავალება</h2>
            <button type="button" className="secondary" onClick={() => setOpen(false)}>დახურვა</button>
          </div>
          <BoundForm action={createTaskAction} label="დავალების მიცემა" onSuccess={closeAfterCreate}>
            {customerId ? <input type="hidden" name="customerId" value={customerId} /> : null}
            <label>სათაური<input name="title" required placeholder="რა უნდა გაკეთდეს" autoFocus /></label>
            <label>ვადა<input name="dueOn" type="date" /></label>
            {customers ? (
              <label className="span-2">კლიენტი
                <ComboBox name="customerId" options={[{ value: "", label: "კლიენტის გარეშე" }, ...customers.map(customerOption)]} defaultValue="" />
              </label>
            ) : null}
            <label>აღწერა<textarea name="description" placeholder="რა არის გასაკეთებელი" rows={4} /></label>
            <PeoplePicker members={members} actorId={actorId} />
            <FileField />
          </BoundForm>
        </section>
      ) : (
        <div className="task-launcher">
          <Button type="button" onClick={() => { setNotice(""); setOpen(true); }}>
            <Plus size={16} /> ახალი დავალება
          </Button>
          {notice ? <p className="ok">{notice}</p> : null}
        </div>
      )}
    </div>
  );
}
