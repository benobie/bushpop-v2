import * as React from "react";
import { cn } from "../lib/cn";

/**
 * Status/error/success panel. `error` stays on the plain Tailwind red scale —
 * `--color-bp-red` (deal red) is reserved for sale/deal badges and pricing,
 * never destructive UI (see tokens.css). `success`/`neutral` both use the
 * BRG neutral surface treatment (no manufactured "success green" — the flat
 * primary green stays reserved for CTAs/links per the token system's own
 * rule; positive framing comes from copy/iconography here, not colour).
 */
const BANNER_VARIANTS = {
  error: "border border-red-200 bg-red-50 text-red-800",
  success: "border border-[var(--color-bp-line)] bg-[var(--color-bp-surface-2)] text-[var(--color-bp-ink)]",
  neutral: "border border-[var(--color-bp-line)] bg-[var(--color-bp-surface-2)] text-[var(--color-bp-ink-2)]",
} as const;

export interface BannerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  variant: keyof typeof BANNER_VARIANTS;
  title?: React.ReactNode;
}

const Banner = React.forwardRef<HTMLDivElement, BannerProps>(
  ({ variant, title, className, children, ...props }, ref) => (
    <div
      ref={ref}
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "rounded-[var(--radius-bp-rect)] px-4 py-4 text-sm",
        BANNER_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
    </div>
  ),
);
Banner.displayName = "Banner";

export { Banner };
