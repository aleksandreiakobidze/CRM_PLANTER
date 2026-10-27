"use client";

import { useActionState, useRef, useState } from "react";
import { initialActionState, type ActionState } from "@/server/actions/state";

type Fact = { label: string; value: string };

function number(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function lineFacts(form: HTMLFormElement): Fact[] {
  const json = form.querySelector<HTMLInputElement>('input[name="lines"]');
  if (json) {
    try {
      const rows = JSON.parse(json.value) as { quantity?: string; unitPrice?: string }[];
      if (!Array.isArray(rows)) return [];
      const quantity = rows.reduce((sum, row) => sum + number(row.quantity), 0);
      const amount = rows.reduce((sum, row) => sum + number(row.quantity) * number(row.unitPrice), 0);
      return [
        { label: "ხაზები", value: String(rows.length) },
        { label: "რაოდენობა სულ", value: quantity.toLocaleString("en-US", { maximumFractionDigits: 3 }) },
        ...(amount > 0 ? [{ label: "ღირებულება", value: `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₾` }] : []),
      ];
    } catch {
      return [];
    }
  }
  const quantities = [...form.querySelectorAll<HTMLInputElement>('input[name="quantity"]')].map((input) => number(input.value));
  if (quantities.length === 0) return [];
  const active = quantities.filter((value) => value > 0);
  return [
    { label: "ხაზები", value: String(active.length) },
    { label: "რაოდენობა სულ", value: active.reduce((sum, value) => sum + value, 0).toLocaleString("en-US", { maximumFractionDigits: 3 }) },
  ];
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
  const [hint, setHint] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function review() {
    const form = formRef.current;
    if (!form) return;
    if (!form.reportValidity()) return;
    const json = form.querySelector<HTMLInputElement>('input[name="lines"]');
    if (json && json.value.trim() === "[]") {
      setHint("ერთი ხაზი მაინც დაამატეთ");
      return;
    }
    setHint(null);
    const next = [...summary];
    for (const [name, title] of Object.entries(pickLabels)) {
      const text = selectedText(form, name);
      if (text) next.push({ label: title, value: text });
    }
    for (const fact of lineFacts(form)) if (!next.some((item) => item.label === fact.label)) next.push(fact);
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
      {hint ? <p className="err">{hint}</p> : null}
      {state.message ? <p className={`${state.ok ? "ok" : "err"} break-all`}>{state.message}</p> : null}
    </form>
  );
}
