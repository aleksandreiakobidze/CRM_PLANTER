"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "@/components/icons";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelTaskAction, completeAssignmentAction, reopenTaskAction, setTaskStatusAction } from "@/server/actions/work-actions";

export type BoardTask = {
  id: string;
  title: string;
  description: string;
  status: "open" | "doing" | "done" | "cancelled";
  dueLabel: string;
  late: boolean;
  customer: { id: string; name: string } | null;
  assignees: { id: string; name: string; done: boolean }[];
  files: { id: string; name: string }[];
  canComplete: boolean;
  canCancel: boolean;
};

const COLUMNS = [
  { status: "open", label: "გასაკეთებელი", next: "doing", nextLabel: "მიმდინარეში" },
  { status: "doing", label: "მიმდინარე", prev: "open", prevLabel: "უკან", next: "done", nextLabel: "შესრულდა" },
  { status: "done", label: "შესრულებული", prev: "doing", prevLabel: "უკან" },
  { status: "cancelled", label: "გაუქმებული" },
] as const;

export function TaskBoard({ tasks, canMove }: { tasks: BoardTask[]; canMove: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [mineLeft, setMineLeft] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done: true, cancelled: true });

  function toggleColumn(status: string) {
    setCollapsed((current) => {
      const next = { ...current, [status]: !current[status] };
      window.localStorage.setItem("planter-board-fold", JSON.stringify(next));
      return next;
    });
  }

  function run(action: () => Promise<void>) {
    setError("");
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch {
        setError("დავალება ვერ შეიცვალა");
      }
    });
  }

  function move(taskId: string, status: "open" | "doing" | "done") {
    if (!canMove) return;
    run(() => setTaskStatusAction(taskId, status));
  }

  const needle = query.trim().toLocaleLowerCase("ka");
  const visible = tasks.filter((task) => {
    if (lateOnly && !task.late) return false;
    if (mineLeft && !task.canComplete) return false;
    if (!needle) return true;
    const hay = [task.title, task.description, task.dueLabel, task.customer?.name ?? "", ...task.assignees.map((person) => person.name)].join(" ").toLocaleLowerCase("ka");
    return hay.includes(needle);
  });

  return (
    <div className={pending ? "board-wrap pending" : "board-wrap"}>
      <div className="board-tools">
        <label className="filter-label">ძებნა დაფაზე
          <input type="search" value={query} placeholder="სათაური, კლიენტი, ადამიანი" aria-label="დაფის ფილტრი" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button type="button" className="chip" aria-pressed={lateOnly} onClick={() => setLateOnly((value) => !value)}>ვადაგადაცილებული</button>
        <button type="button" className="chip" aria-pressed={mineLeft} onClick={() => setMineLeft((value) => !value)}>ჩემი დარჩენილი</button>
        <span className="muted">{visible.length} / {tasks.length}</span>
      </div>
      <div className="board">
      {COLUMNS.map((column) => {
        const cards = visible.filter((task) => task.status === column.status);
        const droppable = canMove && column.status !== "cancelled";
        const folded = Boolean(collapsed[column.status]);
        return (
          <section
            key={column.status}
            className={`${over === column.status ? "column over" : "column"}${folded ? " collapsed" : ""}`}
            onDragOver={(event) => {
              if (!droppable) return;
              event.preventDefault();
              if (folded) {
                setCollapsed((current) => {
                  if (!current[column.status]) return current;
                  const next = { ...current, [column.status]: false };
                  window.localStorage.setItem("planter-board-fold", JSON.stringify(next));
                  return next;
                });
              }
              setOver(column.status);
            }}
            onDragLeave={() => setOver((current) => current === column.status ? null : current)}
            onDrop={(event) => {
              if (!droppable) return;
              event.preventDefault();
              setOver(null);
              const taskId = event.dataTransfer.getData("text/plain");
              if (taskId) move(taskId, column.status);
            }}
          >
            <h2>
              <button type="button" className="column-toggle" aria-expanded={!folded} onClick={() => toggleColumn(column.status)}>
                <span>{column.label} · {cards.length}</span>
                <span className="chev" aria-hidden="true">{folded ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</span>
              </button>
            </h2>
            {folded || cards.length > 0 ? null : <p className="muted">ცარიელია</p>}
            {folded ? null : cards.map((task) => {
              const draggable = canMove && task.status !== "cancelled";
              return (
                <article key={task.id} className={task.late ? "task-card late" : "task-card"}>
                  <strong
                    draggable={draggable}
                    onDragStart={(event) => {
                      if (!draggable) return;
                      event.dataTransfer.setData("text/plain", task.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    {task.title}
                  </strong>
                  {task.description ? <p>{task.description}</p> : null}
                  <p className={task.late ? "err" : "muted"}>{task.dueLabel ? (task.late ? `ვადაგადაცილებული · ${task.dueLabel}` : task.dueLabel) : "ვადის გარეშე"}</p>
                  {task.customer ? <Link href={`/crm/customers/${task.customer.id}`}>{task.customer.name}</Link> : null}
                  <ul className="assignees">
                    {task.assignees.map((person) => (
                      <li key={person.id} className={person.done ? "done" : undefined}>{person.name}{person.done ? " · შესრულებული" : ""}</li>
                    ))}
                  </ul>
                  {task.files.length > 0 ? (
                    <div className="task-files">
                      {task.files.map((file) => <a key={file.id} href={`/tasks/files/${file.id}`}>{file.name}</a>)}
                    </div>
                  ) : null}
                  <div className="task-actions">
                    {task.canComplete ? <button type="button" onClick={() => run(() => completeAssignmentAction(task.id))}>შევასრულე</button> : null}
                    {draggable && "prev" in column && column.prev ? (
                      <button className="secondary" type="button" onClick={() => move(task.id, column.prev)}>{column.prevLabel}</button>
                    ) : null}
                    {draggable && "next" in column && column.next ? (
                      <button type="button" onClick={() => move(task.id, column.next)}>{column.nextLabel}</button>
                    ) : null}
                    {task.canCancel && task.status !== "cancelled" ? (
                      <button className="secondary" type="button" onClick={() => run(() => cancelTaskAction(task.id))}>გაუქმება</button>
                    ) : null}
                    {task.canCancel && task.status === "cancelled" ? (
                      <button type="button" onClick={() => run(() => reopenTaskAction(task.id))}>ხელახლა გახსნა</button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}
      </div>
      {error ? <p className="err">{error}</p> : null}
    </div>
  );
}
