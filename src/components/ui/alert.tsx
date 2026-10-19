import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Alert({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      className={cn("rounded-[10px] border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2.5 text-sm", className)}
      {...props}
    />
  );
}
