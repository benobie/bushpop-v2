import { eq, and } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { carts, cartItems, channelListings, inventoryItems } from "@bushpop/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "../../../../lib/errors.js";

// ADR-015 Sprint 1b W1: carts are now multi-seller. SellerMismatchError and the
// single-seller branch of findOrBuildCart were removed here. Per-item sellers
// derive from channel_listings.inventory_items.owner_id at checkout time via
// assertSingleSellerCart in lib/cart-sellers.ts (temporary W1 gate).

/**
 * Returns true if the error is a PostgreSQL unique constraint violation (code 23505).
 * Handles both raw PostgresError and DrizzleQueryError (which wraps the cause).
 */
function isUniqueConstraintViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  // DrizzleQueryError wraps the real postgres error in .cause
  const cause = (err as { cause?: unknown }).cause;
  const target = cause ?? err;
  // postgres.js sets .code on the error object
  const code = (target as { code?: string }).code;
  if (code === "23505") return true;
  // Fallback: check message for "unique" or "duplicate"
  const msg = target instanceof Error ? target.message : "";
  return msg.includes("unique") || msg.includes("duplicate");
}

// ── Types ──

interface CartWithItems {
  id: string;
  buyerId: string;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    cartId: string;
    channelListingId: string;
    priceCents: number;
    currency: string;
    createdAt: Date;
  }>;
}

// ── Helpers ──

async function findOrBuildCart(
  buyerId: string,
  channelId: string,
): Promise<typeof carts.$inferSelect> {
  const [existing] = await db
    .select()
    .from(carts)
    .where(
      and(
        eq(carts.buyerId, buyerId),
        eq(carts.channelId, channelId),
      ),
    );

  if (existing) {
    return existing;
  }

  // Create new cart
  const [created] = await db
    .insert(carts)
    .values({ buyerId, channelId })
    .returning();

  return created!;
}

// ── Cart reads ──

export async function getCart(buyerId: string, channelId: string): Promise<CartWithItems | null> {
  const [cart] = await db
    .select()
    .from(carts)
    .where(
      and(
        eq(carts.buyerId, buyerId),
        eq(carts.channelId, channelId),
      ),
    );

  if (!cart) {
    return null;
  }

  const items = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id));

  return { ...cart, items };
}

// ── Add item ──

export async function addToCart(
  buyerId: string,
  channelId: string,
  listingId: string,
): Promise<CartWithItems> {
  // Fetch the listing and its seller (owner of the inventory item)
  const [row] = await db
    .select({
      listing: channelListings,
      sellerId: inventoryItems.ownerId,
    })
    .from(channelListings)
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .where(
      and(
        eq(channelListings.id, listingId),
        eq(channelListings.channelId, channelId),
      ),
    );

  if (!row) {
    throw new NotFoundError("Listing not found");
  }

  const { listing, sellerId } = row;

  // Only active listings can be carted
  if (listing.status !== "active") {
    throw new ValidationError(
      `Cannot add listing to cart: listing status is '${listing.status}' (must be active)`,
    );
  }

  if (listing.hiddenAt !== null) {
    throw new ValidationError("This listing is not currently available");
  }

  // Buyers cannot add their own listings
  if (sellerId === buyerId) {
    throw new ValidationError("Cannot add your own listing to cart");
  }

  // ADR-015 Sprint 1b W1: cart is multi-seller; no per-seller branching here.
  const cart = await findOrBuildCart(buyerId, channelId);

  // Insert cart item — unique constraint prevents duplicates (409)
  try {
    await db.insert(cartItems).values({
      cartId: cart.id,
      channelListingId: listingId,
      priceCents: listing.priceCents,
      currency: listing.currency,
    });
  } catch (err: unknown) {
    if (isUniqueConstraintViolation(err)) {
      throw new ConflictError("Listing is already in your cart");
    }
    throw err;
  }

  const items = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id));

  return { ...cart, items };
}

// ── Remove item ──

export async function removeCartItem(
  buyerId: string,
  channelId: string,
  cartItemId: string,
): Promise<void> {
  // Verify the cart item belongs to this buyer's cart
  const [cart] = await db
    .select()
    .from(carts)
    .where(
      and(
        eq(carts.buyerId, buyerId),
        eq(carts.channelId, channelId),
      ),
    );

  if (!cart) {
    throw new NotFoundError("Cart not found");
  }

  const [item] = await db
    .select()
    .from(cartItems)
    .where(
      and(
        eq(cartItems.id, cartItemId),
        eq(cartItems.cartId, cart.id),
      ),
    );

  if (!item) {
    throw new NotFoundError("Cart item not found");
  }

  await db.delete(cartItems).where(eq(cartItems.id, cartItemId));

  // If cart is now empty, delete the cart itself
  const remaining = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id));

  if (remaining.length === 0) {
    await db.delete(carts).where(eq(carts.id, cart.id));
  }
}

// ── Clear cart ──

export async function clearCart(buyerId: string, channelId: string): Promise<void> {
  const [cart] = await db
    .select()
    .from(carts)
    .where(
      and(
        eq(carts.buyerId, buyerId),
        eq(carts.channelId, channelId),
      ),
    );

  if (!cart) {
    // Nothing to clear — idempotent
    return;
  }

  // cartItems rows are cascade-deleted when cart is deleted
  await db.delete(carts).where(eq(carts.id, cart.id));
}
