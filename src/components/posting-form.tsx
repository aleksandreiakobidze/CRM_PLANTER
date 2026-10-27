"use client";

import { useActionState, useRef, useState } from "react";
import { initialActionState, type ActionState } from "@/server/actions/state";

type Fact = { label: string; value: string };

function countLines(form: HTMLFormElement): number | null {
  const json = form.querySelector<HTMLInputElement>('input[name="lines"]');
  if (json) {
    try {
      const rows = JSON.parse(json.value) as unknown[];
      return Array.isArray(rows) ? rows.length : null;
    } catch {
      return null;
    }
  }
  const quantities = [...form.querySelectorAll<HTMLInputElement>('input[name="quantity"]')];
  if (quantities.length === 0) return null;
  return quantities.filter((input) => Number(input.value.replace(",", ".")) > 0).length;
}

function selectedText(form: HTMLFormElement, name: string): string | null {
  const field = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (!field?.value) return null;
  const visible = field.parentElement?.querySelector<HTMLInputElement>('[role="combobox"]');
  return visible?.value || field.value;
}

export function PostingForm({
  action,
  label,
  summary = [],
  pickLabels = {},
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  summary?: Fact[];
  pickLabels?: Record<string, string>;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [facts, setFacts] = useState<Fact[] | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function review() {
    const form = formRef.current;
    if (!form) return;
    if (!form.reportValidity()) return;
    const next = [...summary];
    for (const [name, title] of Object.entries(pickLabels)) {
      const text = selectedText(form, name);
      if (text) next.push({ label: title, value: text });
    }
    const lines = countLines(form);
    if (lines !== null) next.push({ label: "ხაზები", value: String(lines) });
    setFacts(next);
  }

  return (
    <form ref={formRef} action={formAction} className="form" onSubmit={() => setFacts(null)}>
      {children}
      {facts ? (
        <div className="posting-confirm" role="alertdialog" aria-label="გატარების დადასტურება">
          <strong>გადაამოწმეთ გატარებამდე</strong>
          {facts.length ? (
            <dl>
              {facts.map((fact) => (
                <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
              ))}
            </dl>
          ) : null}
          <p className="muted">გატარების შემდეგ დოკუმენტი იკეტება და შეცვლა აღარ შეიძლება.</p>
          <div className="row">
            <button type="button" className="secondary" onClick={() => setFacts(null)}>გაუქმება</button>
            <button type="submit" disabled={pending}>{pending ? "სრულდება..." : "დადასტურება და გატარება"}</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button type="button" disabled={pending} onClick={review}>{pending ? "სრულდება..." : label}</button>
        </div>
      )}
      {state.message ? <p className={`${state.ok ? "ok" : "err"} break-all`}>{state.message}</p> : null}
    </form>
  );
}
