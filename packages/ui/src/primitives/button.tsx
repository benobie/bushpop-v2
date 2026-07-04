"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";
import { useCursorLight } from "../lib/use-cursor-light";
import { spawnBurst } from "../lib/spawn-burst";

/**
 * Lit Glass button system (U0, ported from design/home/bushpop.css).
 * Shape rule: primary is the ONLY pill (money CTA — add-to-cart/buy/sell);
 * every other variant is a 12px rect. Buttons in a group share shape AND
 * height. `outline`/`ghost`/`secondary`/`destructive` are kept because
 * they're already wired across the app (browse/checkout/header etc.) —
 * restyled onto the new glass-rect recipes, not renamed.
 */
const buttonVariants = cva(
  "bp-btn inline-flex items-center justify-center whitespace-nowrap font-medium disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bp-btn-green",
        secondary: "bp-btn-ghost",
        outline: "bp-btn-olite",
        ghost: "bp-btn-ghost",
        dark: "bp-btn-dark",
        destructive: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
      },
      size: {
        sm: "bp-btn-sm",
        md: "",
        lg: "bp-btn-lg",
        icon: "bp-btn-icon",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onClick, onPointerMove, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const isPrimary = (variant ?? "primary") === "primary";
    const lightRef = useCursorLight<HTMLButtonElement>();

    const setRef = React.useCallback(
      (node: HTMLButtonElement | null) => {
        lightRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
      },
      [lightRef, ref],
    );

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (isPrimary && e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          spawnBurst(e.currentTarget, {
            className: "bp-gspark",
            count: 6,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            spread: 26,
            durationMs: 600,
          });
        }
        onClick?.(e);
      },
      [isPrimary, onClick],
    );

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={setRef}
        onClick={handleClick}
        onPointerMove={onPointerMove}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
