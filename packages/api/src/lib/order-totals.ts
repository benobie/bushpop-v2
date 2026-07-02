import {
  calcFeeCents,
  calculateShipping,
  FLAT_RATE_SHIPPING_CENTS,
  PARCELS,
  type ParcelSize,
} from "@bushpop/config";

/**
 * ONE money-math function for both checkout paths (Phase 1 task 9, D9).
 *
 * Commission comes from the effective-dated COMMISSION_SCHEDULE in
 * @bushpop/config (175bps + 30c per order) — NOT channels.platform_fee_bps,
 * which is no longer consulted.
 *
 * Shipping semantics per item shipping_option:
 *   - "buyer_pays" / legacy NULL → buyer pays the flat rate at checkout;
 *     the seller keeps it (they post it themselves).
 *   - "prepaid"  → free shipping for the buyer; the platform buys the label
 *     and deducts its cost from the seller's proceeds.
 *   - "free" / "pickup" → no buyer charge, no deduction (seller self-covers).
 *
 * Acceptance (locked): $200 item, Medium prepaid →
 *   fee $3.80 (175bps + 30c) + label $10.95 → sellerProceedsCents === 18525.
 */

export interface OrderTotalsItem {
  priceCents: number;
  shippingClass: string | null;
  shippingOption: string | null;
  parcelSize: string | null;
}

export interface OrderTotals {
  subtotalCents: number;
  shippingCents: number;
  platformFeeCents: number;
  /** Prepaid label costs deducted from the seller — internal, not persisted. */
  prepaidLabelCents: number;
  sellerProceedsCents: number;
  totalCents: number;
  currency: string;
}

function buyerPaysPostage(item: OrderTotalsItem): boolean {
  return item.shippingOption === "buyer_pays" || item.shippingOption === null;
}

function labelCostCents(item: OrderTotalsItem): number {
  if (item.parcelSize && item.parcelSize in PARCELS) {
    return PARCELS[item.parcelSize as ParcelSize].costCents;
  }
  return FLAT_RATE_SHIPPING_CENTS[item.shippingClass ?? "m"] ?? FLAT_RATE_SHIPPING_CENTS["m"]!;
}

export function calculateOrderTotals(
  items: OrderTotalsItem[],
  currency: string,
): OrderTotals {
  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents, 0);

  const buyerPaysClasses = items
    .filter(buyerPaysPostage)
    .map((item) => item.shippingClass ?? "m");
  const shippingCents = calculateShipping(buyerPaysClasses);

  const platformFeeCents = calcFeeCents(subtotalCents);

  const prepaidLabelCents = items
    .filter((item) => item.shippingOption === "prepaid")
    .reduce((sum, item) => sum + labelCostCents(item), 0);

  const totalCents = subtotalCents + shippingCents;
  const sellerProceedsCents = totalCents - platformFeeCents - prepaidLabelCents;

  return {
    subtotalCents,
    shippingCents,
    platformFeeCents,
    prepaidLabelCents,
    sellerProceedsCents,
    totalCents,
    currency: currency.toUpperCase(),
  };
}
