"use client";

import { useActionState } from "react";
import { initialActionState, type ActionState } from "@/server/actions/state";

export function BoundForm({
  action,
  label,
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="form">
      {children}
      <div className="row">
        <button type="submit" disabled={pending}>
          {pending ? "სრულდება..." : label}
        </button>
      </div>
      {state.message ? <p className={state.ok ? "ok" : "err"}>{state.message}</p> : null}
    </form>
  );
}
