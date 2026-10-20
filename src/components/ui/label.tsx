import { Label as LabelPrimitive } from "@radix-ui/react-label";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive>) {
  return (
    <LabelPrimitive
      className={cn("mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400", className)}
      {...props}
    />
  );
}
