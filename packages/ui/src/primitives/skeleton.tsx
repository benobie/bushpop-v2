import * as React from "react";
import { cn } from "../lib/cn";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--radius-card)] bg-bp-surface-2",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
