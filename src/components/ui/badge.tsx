import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400",
        success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
        error: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500",
        warning: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-500",
        light: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-white/80",
      },
    },
    defaultVariants: { variant: "light" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
