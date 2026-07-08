import { and, eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { addresses, carts, cartItems } from "@bushpop/db/schema";

/**
 * Guest commerce (BF-08) — merges an anonymous buyer's cart + addresses into
 * a real account the moment they sign up or sign in (better-auth's
 * `anonymous` plugin `onLinkAccount` hook, wired in lib/auth.ts). Runs AFTER
 * the new session exists but BEFORE better-auth deletes the anonymous user
 * row, so this is the only window to move anything off it.
 *
 * Best-effort by design: a failure here must never block the real sign-up/
 * sign-in it's piggybacking on, so callers should catch and log, not throw.
 */
export async function mergeAnonymousIdentity(anonymousUserId: string, realUserId: string): Promise<void> {
  if (anonymousUserId === realUserId) return;

  await db.transaction(async (tx) => {
    const anonCarts = await tx.select().from(carts).where(eq(carts.buyerId, anonymousUserId));

    for (const anonCart of anonCarts) {
      const [existingCart] = await tx
        .select()
        .from(carts)
        .where(and(eq(carts.buyerId, realUserId), eq(carts.channelId, anonCart.channelId)));

      if (!existingCart) {
        // No cart for this channel yet — just re-parent it.
        await tx.update(carts).set({ buyerId: realUserId }).where(eq(carts.id, anonCart.id));
        continue;
      }

      // Real account already has a cart for this channel — merge line items
      // (skip any listing already present rather than erroring) then drop
      // the now-empty guest cart.
      const anonItems = await tx.select().from(cartItems).where(eq(cartItems.cartId, anonCart.id));
      for (const item of anonItems) {
        await tx
          .insert(cartItems)
          .values({
            cartId: existingCart.id,
            channelListingId: item.channelListingId,
            priceCents: item.priceCents,
            currency: item.currency,
          })
          .onConflictDoNothing({ target: [cartItems.cartId, cartItems.channelListingId] });
      }
      await tx.delete(carts).where(eq(carts.id, anonCart.id));
    }

    // Reassign any addresses the guest entered (e.g. at checkout) — no
    // uniqueness constraint on addresses.userId, so this can never conflict.
    await tx.update(addresses).set({ userId: realUserId }).where(eq(addresses.userId, anonymousUserId));
  });
}
