import type { StateMachine } from "./state-machine.js";

export type AvailabilityStatus = "available" | "reserved" | "sold";
export type LifecycleState = "owned" | "for_sale" | "offer_only" | "inventory_only" | "sold" | "archived";
export type ListingStatus = "draft" | "active" | "paused" | "sold" | "archived";

/** System-controlled — not exposed to sellers in Phase 1a */
export const AVAILABILITY_MACHINE: StateMachine<AvailabilityStatus> = {
  available: ["reserved", "sold"],
  reserved: ["available", "sold"],
  // sold is terminal
};

/** Seller-controlled lifecycle intent */
export const LIFECYCLE_MACHINE: StateMachine<LifecycleState> = {
  owned: ["for_sale", "offer_only", "inventory_only", "archived"],
  for_sale: ["owned", "offer_only", "inventory_only", "sold", "archived"],
  offer_only: ["owned", "for_sale", "inventory_only", "sold", "archived"],
  inventory_only: ["owned", "for_sale", "offer_only", "archived"],
  sold: ["archived", "owned"], // refund path (sold→owned) is system-only
  archived: ["owned"], // un-archive
};

/** Channel listing status */
export const LISTING_STATUS_MACHINE: StateMachine<ListingStatus> = {
  draft: ["active", "archived"],
  active: ["paused", "sold", "archived"],
  paused: ["active", "archived"],
  sold: ["archived"],
  // archived is terminal
};

/** Lifecycle states that allow a listing to be active */
export const LISTABLE_LIFECYCLE_STATES: readonly LifecycleState[] = ["for_sale", "offer_only"];
