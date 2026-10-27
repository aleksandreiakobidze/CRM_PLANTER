import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/server/labels";
import { formatDateOnly, formatGeorgianShortDate, tbilisiDateString } from "@/server/time";

export function docDate(value: Date | null | undefined, zoned = false): string {
  if (!value) return "—";
  return formatGeorgianShortDate(zoned ? tbilisiDateString(value) : formatDateOnly(value));
}

export function docMoney(value: { toString(): string } | null | undefined, currency = "GEL"): string {
  if (value == null) return "—";
  const amount = Number(value.toString());
  const sign = currency === "GEL" ? "₾" : currency;
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sign}`;
}

export function DocHeader({
  back,
  title,
  status,
  subtitle,
  actions,
}: {
  back: { href: string; label: string };
  title: string;
  status?: { label: string; tone: BadgeTone };
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="docv-head">
      <div className="min-w-0">
        <Link className="back" href={back.href}>{back.label}</Link>
        <div className="docv-title">
          <h1>{title}</h1>
          {status ? <Badge variant={status.tone}>{status.label}</Badge> : null}
        </div>
        {subtitle ? <p className="docv-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="docv-actions">{actions}</div> : null}
    </div>
  );
}

export function DocFacts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <Card className="docv-facts">
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value ?? "—"}</strong>
        </div>
      ))}
    </Card>
  );
}

export type DocColumn = { key: string; header: string; align?: "right" };

export function DocLines({
  title,
  columns,
  rows,
  totals,
  empty = "ხაზი არ არის.",
}: {
  title?: string;
  columns: DocColumn[];
  rows: { id: string; cells: Record<string, ReactNode> }[];
  totals?: { label: string; value: ReactNode; strong?: boolean }[];
  empty?: string;
}) {
  return (
    <Card className="docv-lines">
      {title ? <h2 className="docv-lines-title">{title}</h2> : null}
      {rows.length === 0 ? <p className="docv-empty">{empty}</p> : (
        <>
          <table className="docv-table">
            <thead>
              <tr>
                <th className="w-0">#</th>
                {columns.map((column) => (
                  <th key={column.key} className={cn(column.align === "right" && "num")}>{column.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td className="docv-index">{index + 1}</td>
                  {columns.map((column) => (
                    <td key={column.key} className={cn(column.align === "right" && "num")} data-label={column.header}>
                      {row.cells[column.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {totals?.length ? (
            <dl className="docv-totals">
              {totals.map((total) => (
                <div key={total.label} className={cn(total.strong && "strong")}>
                  <dt>{total.label}</dt>
                  <dd>{total.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      )}
    </Card>
  );
}

export function DocSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("docv-section", className)}>
      <h2 className="docv-lines-title">{title}</h2>
      {children}
    </Card>
  );
}
