"use client";

import { ChevronDown, ChevronRight } from "@/components/icons";
import { useEffect, useState } from "react";

export function Fold({
  id,
  title,
  hint,
  children,
  defaultOpen = true,
}: {
  id: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const saved = window.localStorage.getItem(`planter-fold:${id}`);
    if (saved === "0" || saved === "1") setOpen(saved === "1");
  }, [id]);

  function toggle() {
    const next = !open;
    setOpen(next);
    window.localStorage.setItem(`planter-fold:${id}`, next ? "1" : "0");
  }

  return (
    <section className={open ? "fold open" : "fold"}>
      <button type="button" className="fold-toggle" aria-expanded={open} onClick={toggle}>
        <span>{title}</span>
        {hint ? <small>{hint}</small> : null}
        <span className="chev" aria-hidden="true">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
      </button>
      {open ? <div className="fold-body">{children}</div> : null}
    </section>
  );
}
