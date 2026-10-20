"use client";

import { useActionState, useEffect } from "react";
import { initialActionState, type ActionState } from "@/server/actions/state";

export function BoundForm({
  action,
  label,
  children,
  onSuccess,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  children: React.ReactNode;
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  useEffect(() => {
    if (state.ok && state.message) onSuccess?.();
  }, [state, onSuccess]);
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
