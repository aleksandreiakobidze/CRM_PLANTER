"use client";

import Link from "next/link";
import { CalendarDays, Paperclip } from "@/components/icons";
import { TASK_COPY } from "@/server/features/crm/task-copy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useState, useTransition, type ReactNode } from "react";
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
] as const;

const TABS = [
  { id: "all", label: "ყველა" },
  { id: "open", label: "გასაკეთებელი" },
  { id: "doing", label: "მიმდინარე" },
  { id: "done", label: "შესრულებული" },
  { id: "cancelled", label: "გაუქმებული" },
] as const;

function initial(name: string) {
  return (name.trim()[0] ?? "?").toLocaleUpperCase("ka");
}

export function TaskBoard({
  tasks,
  canMove,
  actions,
}: {
  tasks: BoardTask[];
  canMove: boolean;
  actions?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [lateOnly, setLateOnly] = useState(false);
  const [mineLeft, setMineLeft] = useState(false);

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
    if (tab !== "all" && task.status !== tab) return false;
    if (!needle) return true;
    const hay = [task.title, task.description, task.dueLabel, task.customer?.name ?? "", ...task.assignees.map((person) => person.name)].join(" ").toLocaleLowerCase("ka");
    return hay.includes(needle);
  });
  const columns = tab === "cancelled"
    ? [{ status: "cancelled" as const, label: "გაუქმებული" }]
    : COLUMNS;

  return (
    <div className={cn("space-y-5", pending && "opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/5" role="tablist" aria-label="დავალების სტატუსი">
          {TABS.map((item) => {
            const count = item.id === "all" ? tasks.length : tasks.filter((task) => task.status === item.id).length;
            if (item.id === "cancelled" && count === 0 && tab !== "cancelled") return null;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={cn(
                  "inline-flex h-9 min-h-0 items-center gap-2 rounded-full border-0 px-3.5 text-sm font-medium shadow-none",
                  tab === item.id
                    ? "!bg-white text-gray-800 shadow-sm dark:!bg-gray-800 dark:text-white/90"
                    : "!bg-transparent text-gray-500 hover:!bg-white/70 dark:text-gray-400 dark:hover:!bg-white/5",
                )}
                onClick={() => setTab(item.id)}
              >
                {item.label}
                <span className="tabular-nums text-gray-400 dark:text-gray-500">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            value={query}
            placeholder="ძებნა"
            aria-label="დაფის ფილტრი"
            className="h-9 w-44"
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="button" size="sm" variant={lateOnly ? "default" : "secondary"} onClick={() => setLateOnly((value) => !value)}>
            ვადაგადაცილებული
          </Button>
          <Button type="button" size="sm" variant={mineLeft ? "default" : "secondary"} onClick={() => setMineLeft((value) => !value)}>
            ჩემი
          </Button>
          {actions}
        </div>
      </div>
      <div className={cn("grid gap-6", columns.length === 1 ? "grid-cols-1" : "md:grid-cols-3")}>
        {columns.map((column) => {
          const cards = visible.filter((task) => task.status === column.status);
          const droppable = canMove && column.status !== "cancelled";
          return (
            <section
              key={column.status}
              className={cn("min-w-0", over === column.status && "rounded-2xl ring-2 ring-brand-500/40 ring-offset-4 ring-offset-gray-50 dark:ring-offset-gray-950")}
              onDragOver={(event) => {
                if (!droppable) return;
                event.preventDefault();
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
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                  {column.label}
                  <span className="ml-2 font-medium text-gray-400 dark:text-gray-500">{cards.length}</span>
                </h2>
              </div>
              <div className="space-y-4">
                {cards.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400 dark:border-gray-800">ცარიელია</p>
                ) : cards.map((task) => {
                  const draggable = canMove && task.status !== "cancelled";
                  return (
                    <article
                      key={task.id}
                      draggable={draggable}
                      onDragStart={(event) => {
                        if (!draggable) return;
                        event.dataTransfer.setData("text/plain", task.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      className={cn(
                        "group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]",
                        draggable && "cursor-grab active:cursor-grabbing",
                        task.late && "border-error-200 dark:border-error-500/30",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/work/${task.id}`} className="min-w-0">
                          <h3 className="text-sm leading-6 font-semibold text-gray-800 hover:text-brand-500 dark:text-white/90 dark:hover:text-brand-400">{task.title}</h3>
                        </Link>
                        {task.assignees.length > 0 ? (
                          <div className="flex shrink-0 -space-x-1.5">
                            {task.assignees.slice(0, 3).map((person) => (
                              <span
                                key={person.id}
                                title={person.name}
                                className={cn(
                                  "inline-flex size-7 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-[11px] font-semibold text-gray-600 dark:border-gray-900 dark:bg-gray-800 dark:text-gray-300",
                                  person.done && "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
                                )}
                              >
                                {initial(person.name)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-400 dark:text-gray-500">
                        <span className={cn("inline-flex items-center gap-1.5", task.late && "text-error-500")}>
                          <CalendarDays size={14} />
                          {task.dueLabel ? task.dueLabel : "ვადის გარეშე"}
                        </span>
                        {task.files.length > 0 ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Paperclip size={14} />
                            {task.files.length}
                          </span>
                        ) : null}
                      </div>
                      {task.customer ? (
                        <Link href={`/crm/customers/${task.customer.id}`} className="mt-3 inline-flex">
                          <Badge variant="primary">{task.customer.name}</Badge>
                        </Link>
                      ) : null}
                      <div className="mt-3 hidden flex-wrap gap-2 group-focus-within:flex group-hover:flex">
                        <Button size="sm" type="button" variant="secondary" asChild>
                          <Link href={`/work/${task.id}`}>{TASK_COPY.open}</Link>
                        </Button>
                        {task.canComplete ? (
                          <Button type="button" size="sm" onClick={() => run(() => completeAssignmentAction(task.id))}>შევასრულე</Button>
                        ) : null}
                        {draggable && "prev" in column && column.prev ? (
                          <Button size="sm" type="button" variant="secondary" onClick={() => move(task.id, column.prev)}>{column.prevLabel}</Button>
                        ) : null}
                        {draggable && "next" in column && column.next ? (
                          <Button type="button" size="sm" variant="secondary" onClick={() => move(task.id, column.next)}>{column.nextLabel}</Button>
                        ) : null}
                        {task.canCancel && task.status !== "cancelled" ? (
                          <Button type="button" size="sm" variant="ghost" onClick={() => run(() => cancelTaskAction(task.id))}>გაუქმება</Button>
                        ) : null}
                        {task.canCancel && task.status === "cancelled" ? (
                          <Button type="button" size="sm" onClick={() => run(() => reopenTaskAction(task.id))}>ხელახლა გახსნა</Button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {error ? <p className="text-sm text-error-500">{error}</p> : null}
    </div>
  );
}
