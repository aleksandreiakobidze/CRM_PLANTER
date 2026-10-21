"use client";

import { useActionState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { loginAction } from "@/server/actions/auth-actions";
import { initialActionState } from "@/server/actions/state";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initialActionState);
  return (
    <main className="auth">
      <section className="auth-card card">
        <div className="row">
          <img className="auth-logo" src="/brand/planter-logo.png" alt="Planter" />
          <ThemeToggle />
        </div>
        <div className="grid">
          <h1>შესვლა</h1>
          <p className="muted">სამუშაო ანგარიში. საჯარო რეგისტრაცია გამორთულია.</p>
        </div>
        <form action={action} className="form">
          <label>
            მომხმარებელი ან ელფოსტა
            <input name="login" type="text" autoComplete="username" required />
          </label>
          <label>
            პაროლი
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <div className="row">
            <button type="submit" disabled={pending}>
              {pending ? "შესვლა..." : "შესვლა"}
            </button>
          </div>
          {state.message ? <p className="err">{state.message}</p> : null}
        </form>
      </section>
    </main>
  );
}
