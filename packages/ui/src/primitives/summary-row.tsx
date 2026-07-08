import * as React from "react";
import { cn } from "../lib/cn";

export interface SummaryRowProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Bold, larger, with a hairline divider above — for the final Total row. */
  emphasis?: boolean;
}

/**
 * A single "label ... value" line in a price/order summary. Deliberately
 * dumb — takes already-formatted ReactNode, never touches a number itself.
 * Callers keep calling formatMoney() and pass the string in.
 */
const SummaryRow = React.forwardRef<HTMLDivElement, SummaryRowProps>(
  ({ label, value, emphasis, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-baseline justify-between text-sm",
        emphasis
          ? "border-t border-[var(--color-bp-line)] pt-2 font-semibold text-[var(--color-bp-ink)]"
          : "text-[var(--color-bp-ink-2)]",
        className,
      )}
      {...props}
    >
      <span>{label}</span>
      <span className={emphasis ? undefined : "text-[var(--color-bp-ink)]"}>{value}</span>
    </div>
  ),
);
SummaryRow.displayName = "SummaryRow";

export { SummaryRow };
