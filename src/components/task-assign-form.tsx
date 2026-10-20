"use client";

import { BoundForm } from "@/components/bound-form";
import { ComboBox } from "@/components/combo-box";
import { createTaskAction } from "@/server/actions/work-actions";
import { useCallback, useId, useMemo, useState } from "react";

function PeoplePicker({ members, actorId }: { members: { id: string; name: string }[]; actorId: string }) {
  const listId = useId();
  const [selected, setSelected] = useState<string[]>(() => {
    if (members.some((member) => member.id === actorId)) return [actorId];
    return members[0] ? [members[0].id] : [];
  });
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const chosen = members.filter((member) => selected.includes(member.id));
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ka");
    if (!needle) return members;
    return members.filter((member) => member.name.toLocaleLowerCase("ka").includes(needle));
  }, [members, query]);

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.length === 1 ? current : current.filter((item) => item !== id);
      return [...current, id];
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(visible.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const member = visible[active];
      if (member) toggle(member.id);
    } else if (event.key === "Backspace" && query === "" && selected.length > 1) {
      setSelected((current) => current.slice(0, -1));
    }
  }

  return (
    <div className="people-pick">
      {selected.map((id) => <input key={id} type="hidden" name="assigneeIds" value={id} />)}
      <div className="people-head">
        <span>თანამშრომლები</span>
        <small>{chosen.length} არჩეულია</small>
      </div>
      <div className="people-chips">
        {chosen.map((member) => (
          <span key={member.id} className="people-chip">
            {member.name}
            <button
              type="button"
              className="people-x"
              aria-label={`${member.name} მოხსნა`}
              disabled={chosen.length === 1}
              onClick={() => toggle(member.id)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="people-panel">
        <input
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder="სახელით ძებნა"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul id={listId} role="listbox" aria-label="თანამშრომლები">
          {visible.length === 0 ? <li className="people-empty">ვერ მოიძებნა</li> : visible.map((member, index) => {
            const on = selected.includes(member.id);
            return (
              <li key={member.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={index === active ? "people-option on-key" : "people-option"}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => toggle(member.id)}
                >
                  <span className={on ? "tick on" : "tick"} aria-hidden="true">{on ? "✓" : ""}</span>
                  {member.name}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
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
  customers?: { id: string; name: string }[];
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
    <div className={open ? "task-composer open" : "task-composer"}>
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
                <ComboBox name="customerId" options={[{ value: "", label: "კლიენტის გარეშე" }, ...customers.map((customer) => ({ value: customer.id, label: customer.name }))]} defaultValue="" />
              </label>
            ) : null}
            <label>აღწერა<textarea name="description" placeholder="რა არის გასაკეთებელი" rows={4} /></label>
            <PeoplePicker members={members} actorId={actorId} />
            <FileField />
          </BoundForm>
        </section>
      ) : (
        <div className="task-launcher">
          <button type="button" onClick={() => { setNotice(""); setOpen(true); }}>ახალი დავალება</button>
          {notice ? <p className="ok">{notice}</p> : null}
        </div>
      )}
    </div>
  );
}
