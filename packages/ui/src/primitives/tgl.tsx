"use client";

import * as React from "react";
import { cn } from "../lib/cn";

export interface TglProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/** Glass-knob toggle; track lights BRG when on. */
const Tgl = React.forwardRef<HTMLButtonElement, TglProps>(
  ({ className, checked, onCheckedChange, onClick, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      role="switch"
      aria-checked={checked}
      className={cn("bp-tgl", checked && "bp-tgl-on", className)}
      onClick={(e) => {
        onCheckedChange?.(!checked);
        onClick?.(e);
      }}
      {...props}
    />
  ),
);
Tgl.displayName = "Tgl";

export { Tgl };
