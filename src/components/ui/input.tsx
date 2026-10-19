import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[10px] border border-[var(--line-strong)] bg-white px-3 text-[15px] text-[var(--color-foreground)] transition-colors duration-150 placeholder:text-[#a8a29e] focus-visible:border-[var(--color-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]/25",
        className,
      )}
      {...props}
    />
  );
}
