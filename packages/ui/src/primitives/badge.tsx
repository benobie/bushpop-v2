import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-[var(--radius-badge)] border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-brand-100 text-brand-800",
        draft:
          "border-transparent bg-brand-200 text-brand-700",
        active:
          "border-transparent bg-trust-100 text-trust-800",
        paused:
          "border-transparent bg-brand-100 text-brand-600",
        sold:
          "border-transparent bg-brand-800 text-white",
        outline:
          "border-brand-300 text-brand-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
