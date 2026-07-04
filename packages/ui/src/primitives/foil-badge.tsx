import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";
import { HandHeartIcon } from "../icons/custom";

/**
 * Foil badge family — one anatomy, semantic colours (LAW, not style):
 * deal = red, discount copy reads "N% OFF" · gold = SAVE $N, black text ·
 * fresh = BRG (brand new / just listed) · obsidian = scarcity/info
 * (e.g. "Only 1") · trust = frosted glass, NO sheen (Authentic/Handmade).
 * No fake urgency, ever.
 */
const foilBadgeVariants = cva("bp-badge", {
  variants: {
    variant: {
      deal: "bp-badge-deal",
      gold: "bp-badge-gold",
      fresh: "bp-badge-fresh",
      obsidian: "",
      trust: "bp-badge-trust",
    },
    position: {
      tl: "",
      bl: "bp-badge-bl",
      inline: "bp-badge-inline",
    },
  },
  defaultVariants: {
    variant: "obsidian",
    position: "tl",
  },
});

export interface FoilBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof foilBadgeVariants> {
  /** Trust badges default to the hand-heart glyph; pass `icon={null}` to omit. */
  icon?: React.ReactNode;
}

function FoilBadge({ className, variant, position, icon, children, ...props }: FoilBadgeProps) {
  const resolvedIcon = icon === undefined && variant === "trust" ? <HandHeartIcon size={12} /> : icon;
  return (
    <span className={cn(foilBadgeVariants({ variant, position, className }))} {...props}>
      {resolvedIcon}
      {children}
    </span>
  );
}

export { FoilBadge, foilBadgeVariants };
