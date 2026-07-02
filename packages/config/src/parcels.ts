/**
 * Parcel sizes + prepaid-label costs (AUD cents) for the sell flow.
 *
 * Static AusPost-ish estimates (design prototype `PARCELS`); live AusPost
 * rates are explicitly out of scope day 1. These costs feed BOTH the
 * seller-side payout deduction (prepaid label) and the buyer-side flat
 * shipping rates (see shipping.ts) so the two sides always agree.
 */

export const PARCEL_SIZES = ["small", "medium", "large"] as const;
export type ParcelSize = (typeof PARCEL_SIZES)[number];

export interface ParcelSpec {
  label: string;
  /** Prepaid-label cost in AUD cents. */
  costCents: number;
  /** Corresponding `inventory_items.shipping_class` value. */
  shippingClass: "s" | "m" | "l";
}

export const PARCELS: Record<ParcelSize, ParcelSpec> = {
  small: { label: "Small (<500g)", costCents: 855, shippingClass: "s" },
  medium: { label: "Medium (500g–2kg)", costCents: 1095, shippingClass: "m" },
  large: { label: "Large (2–5kg)", costCents: 1660, shippingClass: "l" },
};

/** Seller-chosen shipping options for a listing (prototype step 5). */
export const SHIPPING_OPTIONS = ["prepaid", "buyer_pays", "free", "pickup"] as const;
export type ShippingOption = (typeof SHIPPING_OPTIONS)[number];

export const SHIPPING_OPTION_LABELS: Record<ShippingOption, string> = {
  prepaid: "Bushpop prepaid label",
  buyer_pays: "Buyer pays postage",
  free: "Free shipping (you cover it)",
  pickup: "Local pickup",
};

/** Derive the engine shipping class from a chosen parcel size. */
export function parcelToShippingClass(parcel: ParcelSize): "s" | "m" | "l" {
  return PARCELS[parcel].shippingClass;
}
