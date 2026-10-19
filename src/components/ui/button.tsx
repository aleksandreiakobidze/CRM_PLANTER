import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-semibold transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-progress min-h-10 px-4 border border-transparent",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-ink)] text-[var(--color-on-ink)] hover:bg-[var(--color-ink-hover)]",
        secondary: "bg-white text-[var(--color-foreground)] border-[var(--color-border)] hover:bg-[var(--color-muted)]",
        ghost: "bg-transparent text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
        destructive: "bg-[var(--color-destructive)] text-white hover:bg-[#881337]",
      },
      size: {
        default: "min-h-10 px-4",
        sm: "min-h-8 px-3 text-[13px]",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
