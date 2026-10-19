"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Bus, CalendarDays, ClipboardList, FilePlus, Receipt, Repeat, UserPlus, Users, type IconProps } from "@/components/icons";

const ICONS: Record<string, (props: IconProps) => ReactNode> = {
  "/work": ClipboardList,
  "/calendar": CalendarDays,
  "/crm/customers": Users,
  "/crm/customers/new": UserPlus,
  "/sales/quotes/new": FilePlus,
  "/finance/invoices": Receipt,
  "/rental/new": Repeat,
  "/excursions/new": Bus,
};

export function ShortcutGrid({
  items,
}: {
  items: { href: string; title: string; text: string }[];
}) {
  return (
    <div className="shortcuts">
      {items.map((item) => {
        const Icon = ICONS[item.href] ?? FilePlus;
        return (
          <Link key={item.href} className="shortcut" href={item.href}>
            <i aria-hidden="true"><Icon size={18} /></i>
            <strong>{item.title}</strong>
            <span>{item.text}</span>
          </Link>
        );
      })}
    </div>
  );
}
