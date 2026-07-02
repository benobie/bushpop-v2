import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { cartItems, channelListings, inventoryItems } from "@bushpop/db/schema";
import { ConflictError, MultiSellerCheckoutNotSupportedError } from "./errors.js";

/**
 * Returns the distinct seller ids (owner ids of the underlying inventory
 * items) across all listings currently in the given cart. Empty array if the
 * cart has no items.
 *
 * ADR-015 Sprint 1b W1: carts are now multi-seller. Call this helper to
 * resolve per-item sellers wherever the old `carts.seller_id` column was read.
 */
export async function deriveCartSellerIds(cartId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ sellerId: inventoryItems.ownerId })
    .from(cartItems)
    .innerJoin(channelListings, eq(cartItems.channelListingId, channelListings.id))
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .where(eq(cartItems.cartId, cartId));

  return rows.map((r) => r.sellerId);
}

/**
 * Temporary scaffolding gate used by checkout + webhook paths in Sprint 1b W1.
 * Resolves the single seller for a cart, or throws if the cart is multi-seller
 * (deferred to the order_groups checkout flow in W2+).
 *
 * @throws ConflictError if the cart is empty
 * @throws MultiSellerCheckoutNotSupportedError if the cart has items from 2+ sellers
 */
// TODO ADR-015-W5: delete once multi-seller checkout is live
export async function assertSingleSellerCart(cartId: string): Promise<string> {
  const sellerIds = await deriveCartSellerIds(cartId);
  if (sellerIds.length === 0) {
    throw new ConflictError("Cart is empty");
  }
  if (sellerIds.length > 1) {
    throw new MultiSellerCheckoutNotSupportedError(sellerIds.length);
  }
  return sellerIds[0]!;
}
