"use client";

import { BoundForm } from "@/components/bound-form";
import { Plus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/actions/state";
import { useCallback, useState, type ReactNode } from "react";

export function ComposePanel({
  buttonLabel,
  title,
  submitLabel,
  action,
  children,
  variant = "default",
}: {
  buttonLabel: string;
  title?: string;
  submitLabel: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  variant?: "default" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className={open ? "task-composer open w-full basis-full" : "task-composer"}>
      {open ? (
        <section className="task-sheet">
          <div className="task-sheet-head">
            <h2>{title ?? buttonLabel}</h2>
            <button type="button" className="secondary" onClick={close}>
              დახურვა
            </button>
          </div>
          <BoundForm action={action} label={submitLabel} onSuccess={close}>
            {children}
          </BoundForm>
        </section>
      ) : (
        <div className="task-launcher">
          <Button type="button" variant={variant} onClick={() => setOpen(true)}>
            <Plus size={16} /> {buttonLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
