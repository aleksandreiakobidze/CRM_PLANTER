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
  const openCount = tasks.filter((task) => task.status === "open" || task.status === "doing").length;
  return (
    <section className="grid">
      <div className="work-top">
        <div className="page-head">
          <div className="row">
            <h1>ჩემი სამუშაო</h1>
            <div className="segment" role="group" aria-label="დავალებების არე">
              <Link href="/work" aria-current={scope === "mine" ? "page" : undefined}>ჩემი</Link>
              {canSeeAll ? <Link href="/work?scope=all" aria-current={scope === "all" ? "page" : undefined}>ყველა</Link> : null}
            </div>
          </div>
          <p>{scope === "all" ? "ორგანიზაციის ყველა დავალება." : "მხოლოდ შენზე გაცემული დავალება."} ღია და მიმდინარე: {openCount}.</p>
        </div>
        {canWrite ? (
          <TaskAssignForm
            actorId={actor.userId}
            customers={customers}
            members={members.map((member) => ({ id: member.userId, name: member.user.name }))}
          />
        ) : null}
      </div>
      <Fold id="work-today" title="დღეს" hint={`${day.contacts.length} კონტაქტი · ${day.tasks.length} დავალება`}>
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
                  <Link key={task.id} href={task.customer ? `/crm/customers/${task.customer.id}` : "/work"}>
                    {task.title}
                    <small>{task.dueOn ? formatDateOnly(task.dueOn) : "ვადის გარეშე"}</small>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </Fold>
      <TaskBoard
        canMove={canWrite}
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
    </section>
  );
}
