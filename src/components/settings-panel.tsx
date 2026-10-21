"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "@/components/icons";
import { cn } from "@/lib/utils";

export function SettingsPanel({
  id,
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const saved = window.localStorage.getItem(`planter-settings:${id}`);
    if (saved === "0" || saved === "1") setOpen(saved === "1");
  }, [id]);

  function toggle() {
    const next = !open;
    setOpen(next);
    window.localStorage.setItem(`planter-settings:${id}`, next ? "1" : "0");
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <button
        type="button"
        className="settings-toggle"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold text-gray-800 dark:text-white/90">{title}</span>
          {hint ? <span className="mt-0.5 block text-sm text-gray-500 dark:text-gray-400">{hint}</span> : null}
        </span>
        <ChevronDown
          size={18}
          className={cn("shrink-0 text-gray-400 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open ? <div className="space-y-5 border-t border-gray-200 px-5 py-5 dark:border-gray-800">{children}</div> : null}
    </section>
  );
}
