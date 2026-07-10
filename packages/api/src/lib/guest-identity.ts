import { and, eq, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  addresses,
  carts,
  cartItems,
  checkoutSessions,
  listingReports,
  notifications,
  orderGroups,
  orders,
  savedSearches,
  user,
  wishlists,
} from "@bushpop/db/schema";
import { ulid } from "ulid";

/**
 * Domain better-auth's `anonymous` plugin uses for placeholder guest emails
 * (`<id>@guest.bushpop.com.au`). Single source of truth — lib/auth.ts wires
 * it into the plugin config, and workers/email.ts uses it to skip sends to
 * these undeliverable placeholder addresses.
 */
export const GUEST_EMAIL_DOMAIN = "guest.bushpop.com.au";

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; cause?: { code?: unknown } };
  return e.code === "23505" || e.cause?.code === "23505";
}

/**
 * A fresh, guaranteed-unused placeholder email for an anonymous user, in the
 * same shape better-auth's `anonymous` plugin mints (`temp-<id>@<domain>`).
 */
export function anonymousPlaceholderEmail(): string {
  return `temp-${ulid()}@${GUEST_EMAIL_DOMAIN}`;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Whether anything pins this cart to a specific set of line items. Both FKs
 * are NO ACTION, so a referenced cart cannot be deleted either.
 */
async function cartHasReferences(tx: Tx, cartId: string): Promise<boolean> {
  const [session] = await tx
    .select({ id: checkoutSessions.id })
    .from(checkoutSessions)
    .where(eq(checkoutSessions.cartId, cartId))
    .limit(1);
  if (session) return true;

  const [group] = await tx
    .select({ id: orderGroups.id })
    .from(orderGroups)
    .where(eq(orderGroups.cartId, cartId))
    .limit(1);
  return Boolean(group);
}

/** Copy `fromCartId`'s line items into `toCartId`, skipping listings it already has. */
async function mergeCartItems(tx: Tx, fromCartId: string, toCartId: string): Promise<void> {
  const items = await tx.select().from(cartItems).where(eq(cartItems.cartId, fromCartId));
  for (const item of items) {
    await tx
      .insert(cartItems)
      .values({
        cartId: toCartId,
        channelListingId: item.channelListingId,
        priceCents: item.priceCents,
        currency: item.currency,
      })
      .onConflictDoNothing({ target: [cartItems.cartId, cartItems.channelListingId] });
  }
}

/**
 * Guest commerce (BF-08) — merges an anonymous buyer's cart + addresses into
 * a real account the moment they sign up or sign in (better-auth's
 * `anonymous` plugin `onLinkAccount` hook, wired in lib/auth.ts). Runs AFTER
 * the new session exists but BEFORE better-auth deletes the anonymous user
 * row, so this is the only window to move anything off it.
 *
 * Everything the guest can own has to move, for one of two reasons:
 *
 *  - `orders`, `checkout_sessions` and `order_groups` FK the buyer with NO
 *    ACTION, so a leftover row makes the anonymous-user delete fail. The
 *    plugin logs and swallows that failure, leaving a ghost account that
 *    still owns the buyer's purchase history.
 *  - `notifications`, `wishlists`, `saved_searches` and `listing_reports`
 *    cascade, so a leftover row is silently destroyed with the guest.
 *
 * Deliberately NOT reassigned: `orders.sellerId`,
 * `order_group_seller_allocations.sellerId` (an anonymous user can never be a
 * seller — that needs a seller_profiles row and a role grant, neither of
 * which anonymous sign-in creates), and `refunds.initiatedBy` /
 * `allocation_refunds.initiatedBy` (SET NULL, and only sellers/admins ever
 * initiate a refund).
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

      // Real account already has a cart for this channel, so one of the two
      // carts has to go. Whichever survives keeps its id: a checkout session
      // or order group is quoted against a specific cart, and both the reuse
      // path (`initiateCheckout`) and the late-payment path
      // (`handlePaymentAfterExpiry`) rebuild from that cart's current items.
      // Re-pointing cart_id would silently re-quote them against the merged
      // contents. So a cart is only ever deleted when nothing references it.
      const anonCartBlocked = await cartHasReferences(tx, anonCart.id);

      if (!anonCartBlocked) {
        await mergeCartItems(tx, anonCart.id, existingCart.id);
        await tx.delete(carts).where(eq(carts.id, anonCart.id));
        continue;
      }

      if (await cartHasReferences(tx, existingCart.id)) {
        // Both carts are pinned by a checkout session or order group. Leave
        // them alone rather than corrupt either quote — every user-owned row
        // below still moves across, so the buyer keeps their orders. The
        // anonymous row survives this round; its email is released at the end
        // of the transaction so it can never squat one.
        console.warn(
          "[guest-identity] Skipped cart merge: both carts have checkout sessions or order groups",
          { anonymousUserId, realUserId, anonCartId: anonCart.id, realCartId: existingCart.id },
        );
        continue;
      }

      // Only the guest cart is pinned — keep it and retire the real account's
      // cart into it instead.
      await mergeCartItems(tx, existingCart.id, anonCart.id);
      await tx.delete(carts).where(eq(carts.id, existingCart.id));
      await tx.update(carts).set({ buyerId: realUserId }).where(eq(carts.id, anonCart.id));
    }

    // Reassign any addresses the guest entered (e.g. at checkout) — no
    // uniqueness constraint on addresses.userId, so this can never conflict.
    await tx.update(addresses).set({ userId: realUserId }).where(eq(addresses.userId, anonymousUserId));

    // Buyer-owned rows with no per-user uniqueness — plain reassignment.
    await tx.update(orders).set({ buyerId: realUserId }).where(eq(orders.buyerId, anonymousUserId));
    await tx.update(orderGroups).set({ buyerId: realUserId }).where(eq(orderGroups.buyerId, anonymousUserId));
    await tx
      .update(checkoutSessions)
      .set({ buyerId: realUserId })
      .where(eq(checkoutSessions.buyerId, anonymousUserId));
    await tx
      .update(notifications)
      .set({ userId: realUserId })
      .where(eq(notifications.userId, anonymousUserId));

    // Engagement rows carry a per-user unique key, so only the ones the real
    // account doesn't already hold can move. The rest are duplicates of what
    // it has, and cascade away with the guest row.
    await tx.execute(sql`
      UPDATE ${wishlists} AS w SET user_id = ${realUserId}
      WHERE w.user_id = ${anonymousUserId}
        AND NOT EXISTS (
          SELECT 1 FROM ${wishlists} AS e
          WHERE e.user_id = ${realUserId} AND e.channel_listing_id = w.channel_listing_id
        )
    `);
    await tx.execute(sql`
      UPDATE ${savedSearches} AS s SET user_id = ${realUserId}
      WHERE s.user_id = ${anonymousUserId}
        AND NOT EXISTS (
          SELECT 1 FROM ${savedSearches} AS e
          WHERE e.user_id = ${realUserId} AND e.channel_id = s.channel_id AND e.query_hash = s.query_hash
        )
    `);

    // listing_reports' unique index only covers non-dismissed reports, so a
    // dismissed guest report never collides and always moves.
    await tx.execute(sql`
      UPDATE ${listingReports} AS r SET reporter_id = ${realUserId}
      WHERE r.reporter_id = ${anonymousUserId}
        AND (
          r.status = 'dismissed'
          OR NOT EXISTS (
            SELECT 1 FROM ${listingReports} AS e
            WHERE e.reporter_id = ${realUserId}
              AND e.channel_listing_id = r.channel_listing_id
              AND e.status <> 'dismissed'
          )
        )
    `);

    // The guest row is about to be deleted, and setGuestCheckoutEmail may have
    // stamped the customer's real email on it. Hand that email back now, so a
    // delete that fails anyway (a cart we declined to merge above) can never
    // leave the row squatting an address nobody can sign up with.
    await tx
      .update(user)
      .set({ email: anonymousPlaceholderEmail(), updatedAt: new Date() })
      .where(and(eq(user.id, anonymousUserId), eq(user.isAnonymous, true)));
  });
}

/**
 * Release a real customer email that `setGuestCheckoutEmail` stamped onto an
 * anonymous user row, handing it back to the placeholder domain.
 *
 * Needed because better-auth's sign-up inserts the new `user` row BEFORE the
 * `onLinkAccount` hook (and the anonymous-row delete) ever runs — so a guest
 * who checks out with an email and then signs up with that same email, which
 * is exactly what the sign-up page's prefill invites, collides with their own
 * guest row on `user.email` and gets `USER_ALREADY_EXISTS`.
 *
 * Scoped to `isAnonymous = true` and to a caller-supplied id, so it can never
 * touch a real account's email nor another guest's.
 */
export async function releaseAnonymousEmail(anonymousUserId: string): Promise<void> {
  await db
    .update(user)
    .set({ email: anonymousPlaceholderEmail(), updatedAt: new Date() })
    .where(and(eq(user.id, anonymousUserId), eq(user.isAnonymous, true)));
}
