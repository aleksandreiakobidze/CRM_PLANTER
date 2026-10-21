import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskActions } from "@/components/task-actions";
import { TaskChat } from "@/components/task-chat";
import { getActor } from "@/server/auth/session";
import { BusinessError } from "@/server/errors";
import { ensureTaskThread } from "@/server/features/chat/chat-service";
import { TASK_COPY } from "@/server/features/crm/task-copy";
import { formatDateOnly, tbilisiDateString } from "@/server/time";

const STATUS: Record<string, { label: string; variant: "light" | "primary" | "success" | "error" }> = {
  open: { label: TASK_COPY.openStatus, variant: "light" },
  doing: { label: TASK_COPY.doing, variant: "primary" },
  done: { label: TASK_COPY.done, variant: "success" },
  cancelled: { label: TASK_COPY.cancelled, variant: "error" },
};

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  try {
    const { task, thread } = await ensureTaskThread(actor, id);
    const status = STATUS[task.status] ?? STATUS.open;
    const due = task.dueOn ? formatDateOnly(task.dueOn) : "";
    const today = tbilisiDateString();
    const late = Boolean(due && due < today && task.status !== "done" && task.status !== "cancelled");
    const mine = task.assignments.find((item) => item.userId === actor.userId);
    const canWrite = actor.permissions.has("crm.write");
    const canComplete = Boolean(mine && mine.status !== "done" && task.status !== "cancelled" && task.status !== "done");
    const canCancel = task.createdById === actor.userId || canWrite;

    return (
      <section className="space-y-6">
        <div>
          <Link className="text-sm font-medium text-brand-500 hover:text-brand-600" href="/work">
            {TASK_COPY.back}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">{task.title}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
            {late ? <Badge variant="error">{TASK_COPY.late}</Badge> : null}
          </div>
        </div>

        <div className="task-desk">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Fact label={TASK_COPY.due} value={due || TASK_COPY.noDue} />
              <Fact label={TASK_COPY.author} value={task.createdBy?.name ?? "—"} />
              <Fact
                label={TASK_COPY.customer}
                value={task.customer ? <Link className="text-brand-500 hover:text-brand-600" href={`/crm/customers/${task.customer.id}`}>{task.customer.name}</Link> : TASK_COPY.noCustomer}
              />
              <Fact
                label={TASK_COPY.assigned}
                value={task.assignments.length
                  ? task.assignments.map((item) => `${item.user.name}${item.status === "done" ? ` · ${TASK_COPY.done}` : ""}`).join(", ")
                  : "—"}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{TASK_COPY.description}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                  {task.description?.trim() || TASK_COPY.noDescription}
                </p>
                <TaskActions
                  taskId={task.id}
                  status={task.status}
                  canComplete={canComplete}
                  canCancel={canCancel}
                  canWrite={canWrite}
                />
              </CardContent>
            </Card>

            {task.attachments.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>{TASK_COPY.files}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="task-files">
                    {task.attachments.map((file) => (
                      <li key={file.id}>
                        <a href={`/tasks/files/${file.id}`}>{file.fileName}</a>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </div>
          <TaskChat threadId={thread.id} title={TASK_COPY.chat} />
        </div>
      </section>
    );
  } catch (error) {
    if (error instanceof BusinessError) notFound();
    throw error;
  }
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium text-gray-400 dark:text-gray-500">{label}</p>
      <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">{value}</div>
    </Card>
  );
}
