"use client";

import * as React from "react";
import { cn } from "../lib/cn";
import { useCursorLight } from "../lib/use-cursor-light";

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

/** Filter/category chip — cursor-light hover, small scale. */
const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, active, type = "button", ...props }, ref) => {
    const lightRef = useCursorLight<HTMLButtonElement>();

    const setRef = React.useCallback(
      (node: HTMLButtonElement | null) => {
        lightRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
      },
      [lightRef, ref],
    );

    return (
      <button
        ref={setRef}
        type={type}
        className={cn("bp-chip", active && "bp-chip-on", className)}
        aria-pressed={active}
        {...props}
      />
    );
  },
);
Chip.displayName = "Chip";

export { Chip };
