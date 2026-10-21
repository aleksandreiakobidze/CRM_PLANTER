import Link from "next/link";
import { Fold } from "@/components/fold";
import { TaskAssignForm } from "@/components/task-assign-form";
import { TaskBoard } from "@/components/task-board";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { listTasks, myDay } from "@/server/features/crm/customer-service";
import { formatDateOnly, tbilisiDateString } from "@/server/time";

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const actor = await getActor();
  const params = await searchParams;
  const canSeeAll = actor.permissions.has("task.read.all");
  const canWrite = actor.permissions.has("crm.write");
  const scope = params.scope === "all" && canSeeAll ? "all" : "mine";
  const [day, tasks, customers, members] = await Promise.all([
    myDay(actor),
    listTasks(actor, scope),
    getDb().customer.findMany({
      where: { organizationId: actor.organizationId, mergedIntoId: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getDb().membership.findMany({
      where: { organizationId: actor.organizationId, active: true, user: { active: true } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  const today = tbilisiDateString();
  const form = canWrite ? (
    <TaskAssignForm
      actorId={actor.userId}
      customers={customers}
      members={members.map((member) => ({ id: member.userId, name: member.user.name }))}
    />
  ) : null;
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">დავალებები</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {scope === "all" ? "ორგანიზაციის ყველა დავალება." : "შენზე გაცემული დავალება."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/work"
            aria-current={scope === "mine" ? "page" : undefined}
            className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium ${scope === "mine" ? "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400" : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.03]"}`}
          >
            ჩემი
          </Link>
          {canSeeAll ? (
            <Link
              href="/work?scope=all"
              aria-current={scope === "all" ? "page" : undefined}
              className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium ${scope === "all" ? "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400" : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.03]"}`}
            >
              ყველა
            </Link>
          ) : null}
        </div>
      </div>
      <TaskBoard
        canMove={canWrite}
        actions={form}
        tasks={tasks.map((task) => {
          const due = task.dueOn ? formatDateOnly(task.dueOn) : "";
          const status = task.status === "doing" || task.status === "done" || task.status === "cancelled" ? task.status : "open";
          const mine = task.assignments.find((item) => item.userId === actor.userId);
          return {
            id: task.id,
            title: task.title,
            description: task.description ?? "",
            status,
            dueLabel: due,
            late: Boolean(due && due < today && status !== "done" && status !== "cancelled"),
            customer: task.customer ? { id: task.customer.id, name: task.customer.name } : null,
            assignees: task.assignments.map((item) => ({ id: item.userId, name: item.user.name, done: item.status === "done" })),
            files: task.attachments.map((file) => ({ id: file.id, name: file.fileName })),
            canComplete: Boolean(mine && mine.status !== "done" && status !== "cancelled" && status !== "done"),
            canCancel: task.createdById === actor.userId || canWrite,
          };
        })}
      />
      <Fold id="work-today" title="დღეს" defaultOpen={false} hint={`${day.contacts.length} კონტაქტი · ${day.tasks.length} დავალება`}>
        <div className="split">
          <div>
            <h2 className="block-title">გადასარეკი</h2>
            {day.contacts.length === 0 ? <p className="muted">დღეს გადასარეკი არ არის.</p> : (
              <div className="results">
                {day.contacts.map((customer) => (
                  <Link key={customer.id} href={`/crm/customers/${customer.id}`}>
                    {customer.name}
                    <small>{customer.nextContactOn ? formatDateOnly(customer.nextContactOn) : ""}</small>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div>
            <h2 className="block-title">ვადა დღეს ან ვადის გარეშე</h2>
            {day.tasks.length === 0 ? <p className="muted">ასეთი ღია დავალება არ არის.</p> : (
              <div className="results">
                {day.tasks.map((task) => (
                  <Link key={task.id} href={`/work/${task.id}`}>
                    {task.title}
                    <small>{task.dueOn ? formatDateOnly(task.dueOn) : "ვადის გარეშე"}</small>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </Fold>
    </section>
  );
}
