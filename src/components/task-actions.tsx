"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelTaskAction, completeAssignmentAction, reopenTaskAction, setTaskStatusAction } from "@/server/actions/work-actions";
import { TASK_COPY } from "@/server/features/crm/task-copy";

export function TaskActions({
  taskId,
  status,
  canComplete,
  canCancel,
  canWrite,
}: {
  taskId: string;
  status: string;
  canComplete: boolean;
  canCancel: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <div className={`flex flex-wrap gap-2 ${pending ? "opacity-70" : ""}`}>
      {canComplete ? (
        <Button type="button" size="sm" onClick={() => run(() => completeAssignmentAction(taskId))}>
          {TASK_COPY.complete}
        </Button>
      ) : null}
      {canWrite && status === "open" ? (
        <Button type="button" size="sm" variant="secondary" onClick={() => run(() => setTaskStatusAction(taskId, "doing"))}>
          {TASK_COPY.toDoing}
        </Button>
      ) : null}
      {canWrite && status === "doing" ? (
        <>
          <Button type="button" size="sm" variant="secondary" onClick={() => run(() => setTaskStatusAction(taskId, "open"))}>
            {TASK_COPY.toOpen}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => run(() => setTaskStatusAction(taskId, "done"))}>
            {TASK_COPY.toDone}
          </Button>
        </>
      ) : null}
      {canWrite && status === "done" ? (
        <Button type="button" size="sm" variant="secondary" onClick={() => run(() => setTaskStatusAction(taskId, "doing"))}>
          {TASK_COPY.toOpen}
        </Button>
      ) : null}
      {canCancel && status !== "cancelled" ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => run(() => cancelTaskAction(taskId))}>
          {TASK_COPY.cancel}
        </Button>
      ) : null}
      {canCancel && status === "cancelled" ? (
        <Button type="button" size="sm" onClick={() => run(() => reopenTaskAction(taskId))}>
          {TASK_COPY.reopen}
        </Button>
      ) : null}
    </div>
  );
}
