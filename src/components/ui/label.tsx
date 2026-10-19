import { Label as LabelPrimitive } from "@radix-ui/react-label";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive>) {
  return (
    <LabelPrimitive
      className={cn("grid gap-1.5 text-[13px] font-semibold text-[var(--color-muted-foreground)]", className)}
      {...props}
    />
  );
}
