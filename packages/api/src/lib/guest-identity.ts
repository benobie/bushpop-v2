import { and, eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { addresses, carts, cartItems } from "@bushpop/db/schema";

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; cause?: { code?: unknown } };
  return e.code === "23505" || e.cause?.code === "23505";
}

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
      let [existingCart] = await tx
        .select()
        .from(carts)
        .where(and(eq(carts.buyerId, realUserId), eq(carts.channelId, anonCart.channelId)));

      if (!existingCart) {
        // No cart for this channel yet — re-parent in place so any checkout
        // session that already points at this cart keeps the same cart id. Do
        // it inside a savepoint: another session can create the real user's
        // cart between the SELECT above and this UPDATE, tripping
        // carts_buyer_channel_unique.
        try {
          await tx.transaction(async (nestedTx) => {
            await nestedTx
              .update(carts)
              .set({ buyerId: realUserId })
              .where(eq(carts.id, anonCart.id));
          });
          continue;
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;

          // A concurrent request created the real cart first. Re-read it and
          // fall through to the merge-with-dedup path below.
          [existingCart] = await tx
            .select()
            .from(carts)
            .where(and(eq(carts.buyerId, realUserId), eq(carts.channelId, anonCart.channelId)));

          if (!existingCart) throw err;
        }
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
