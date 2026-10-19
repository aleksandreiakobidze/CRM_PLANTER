"use client";

import { useActionState } from "react";
import { useParams } from "next/navigation";
import { acceptInviteAction } from "@/server/actions/auth-actions";
import { initialActionState } from "@/server/actions/state";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const [state, action, pending] = useActionState(acceptInviteAction, initialActionState);
  return (
    <main className="auth">
      <section className="auth-card card">
        <img className="auth-logo" src="/brand/planter-logo.png" alt="Planter" />
        <h1>ანგარიშის გააქტიურება</h1>
        <p className="muted">პაროლი მინიმუმ 10 სიმბოლოა.</p>
        <form action={action} className="form">
          <input type="hidden" name="token" value={params.token} />
          <label>
            სახელი
            <input name="name" required autoComplete="name" />
          </label>
          <label>
            პაროლი
            <input name="password" type="password" minLength={10} required autoComplete="new-password" />
          </label>
          <div className="row">
            <button disabled={pending} type="submit">
              {pending ? "სრულდება..." : "ანგარიშის შექმნა"}
            </button>
          </div>
          {state.message ? <p className="err">{state.message}</p> : null}
        </form>
      </section>
    </main>
  );
}
