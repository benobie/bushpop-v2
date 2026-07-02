/**
 * Flat-rate shipping lookup by shipping class (cents, AUD).
 *
 * Shipping classes correspond to `inventory_items.shipping_class`:
 *   xs — small envelope / letter (e.g. accessories, jewellery)
 *   s  — small satchel (e.g. t-shirts, belts)
 *   m  — medium satchel (e.g. jeans, dresses)
 *   l  — large satchel (e.g. jackets, coats)
 *   xl — extra large / bulky (e.g. boots, bags)
 */
export const FLAT_RATE_SHIPPING_CENTS: Record<string, number> = {
  xs: 970,
  s: 1115,
  m: 1525,
  l: 1930,
  xl: 2330,
};

/**
 * Surcharge added to the base shipping rate for multi-item carts.
 * Applied once per cart (not per extra item).
 */
export const MULTI_ITEM_SURCHARGE_CENTS = 300;

/**
 * Minimum order total in cents. Orders below this threshold are rejected
 * to prevent Stripe fee erosion (Stripe charges ~30c + 1.75% per transaction).
 */
export const MIN_ORDER_TOTAL_CENTS = 1000;

/**
 * Calculate shipping for a cart.
 *
 * @param shippingClasses - Array of shipping classes for items in the cart
 * @returns Shipping cost in cents
 */
export function calculateShipping(shippingClasses: string[]): number {
  if (shippingClasses.length === 0) return 0;

  // Use the most expensive item's shipping class as the base rate
  const baseCents = shippingClasses
    .map((cls) => FLAT_RATE_SHIPPING_CENTS[cls] ?? FLAT_RATE_SHIPPING_CENTS["m"]!)
    .reduce((max, cents) => Math.max(max, cents), 0);

  // Add multi-item surcharge for carts with more than one item
  const surcharge = shippingClasses.length > 1 ? MULTI_ITEM_SURCHARGE_CENTS : 0;

  return baseCents + surcharge;
}
