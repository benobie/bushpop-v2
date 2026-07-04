import * as React from "react";
import { cn } from "../lib/cn";

export interface RailProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Single-row horizontal rail. FLEX, NEVER GRID — grid + overflow-x silently
 * enables vertical scroll (shipped 3x in the prototype). Scroll-snap, hidden
 * scrollbars, fractional peek at phone width comes from the row's own
 * item widths (e.g. `w-[42%] sm:w-[28%]`) — Rail only owns the row mechanics.
 */
const Rail = React.forwardRef<HTMLDivElement, RailProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("bp-rail", className)} {...props} />
));
Rail.displayName = "Rail";

export interface RailItemProps extends React.HTMLAttributes<HTMLDivElement> {}

const RailItem = React.forwardRef<HTMLDivElement, RailItemProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("bp-rail-item", className)} {...props} />
));
RailItem.displayName = "RailItem";

export { Rail, RailItem };
