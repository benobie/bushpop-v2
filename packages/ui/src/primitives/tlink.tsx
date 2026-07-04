import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../lib/cn";

export interface TlinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  asChild?: boolean;
  /** ink = neutral (default is flat-primary BRG-bright) */
  tone?: "brand" | "ink";
}

/** Text link — draw-in underline, lights up on hover; icon (`.bp-pic` child) nudges. */
const Tlink = React.forwardRef<HTMLAnchorElement, TlinkProps>(
  ({ className, asChild = false, tone = "brand", ...props }, ref) => {
    const Comp = asChild ? Slot : "a";
    return (
      <Comp
        ref={ref}
        className={cn("bp-tlink", tone === "ink" && "bp-tlink-ink", className)}
        {...props}
      />
    );
  },
);
Tlink.displayName = "Tlink";

export { Tlink };
