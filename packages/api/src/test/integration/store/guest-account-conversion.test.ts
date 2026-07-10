import { describe, it, expect, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  carts,
  checkoutSessions,
  orders,
  savedSearches,
  user,
  wishlists,
} from "@bushpop/db/schema";
import {
  signUpTestUser,
  signInAnonymousTestUser,
  linkAnonymousToNewAccount,
  grantSellerRole,
} from "../../helpers/auth.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";
import { authedRequest, getTestApp } from "../../helpers/http.js";
import { setGuestCheckoutEmail } from "../../../routes/v1/store/checkout/service.js";

/**
 * Guest → account conversion. `mergeAnonymousIdentity` (lib/guest-identity.ts)
 * runs in Better Auth's `onLinkAccount` hook, in the only window between the
 * real account existing and the anonymous `user` row being deleted.
 *
 * Two defects this covers:
 *
 *  1. Anything FK'd to the anonymous user with a NO ACTION constraint
 *     (`orders`, `checkout_sessions`, `order_groups`) blocks that delete. The
 *     plugin swallows the failure, so the anonymous row survives, still owning
 *     the buyer's orders — they convert and their purchase history vanishes.
 *
 *  2. `setGuestCheckoutEmail` writes the customer's real email onto the
 *     anonymous row. If that row is never deleted (defect 1), the email is
 *     squatted forever. Even when it IS deleted, the sign-up that triggers the
 *     delete inserts its `user` row FIRST — so signing up with the same email
 *     you checked out with collides on `user.email` and 422s before the merge
 *     hook ever runs. The sign-up page prefills exactly that email.
 */
describe("Guest → account conversion (guest merge)", () => {
  let sellerId: string;
  let channelId: string;

  beforeEach(async () => {
    const seller = await signUpTestUser();
    sellerId = seller.user.id;
    await grantSellerRole(sellerId);
    channelId = (await getBushpopChannel()).id;
  });

  /** Insert a paid order + its checkout session directly, bypassing Stripe. */
  async function insertPaidOrder(buyerId: string) {
    const [cart] = await db
      .insert(carts)
      .values({ buyerId, channelId })
      .onConflictDoUpdate({
        target: [carts.buyerId, carts.channelId],
        set: { updatedAt: new Date() },
      })
      .returning();

    const money = {
      subtotalCents: 4500,
      shippingCents: 0,
      platformFeeCents: 400,
      sellerProceedsCents: 4100,
      totalCents: 4500,
      currency: "AUD",
    };

    const [session] = await db
      .insert(checkoutSessions)
      .values({ cartId: cart!.id, buyerId, channelId, status: "succeeded", ...money })
      .returning();

    const [order] = await db
      .insert(orders)
      .values({
        checkoutSessionId: session!.id,
        buyerId,
        sellerId,
        channelId,
        status: "paid",
        stripePaymentIntentId: `pi_test_guest_merge_${session!.id}`,
        ...money,
      })
      .returning();

    return { order: order!, session: session!, cart: cart! };
  }

  const anonRow = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0];

  it("reassigns the guest's order and checkout session to the new account, then deletes the guest row", async () => {
    const guest = await signInAnonymousTestUser();
    const { order, session } = await insertPaidOrder(guest.user.id);

    const linked = await linkAnonymousToNewAccount(guest.sessionToken);

    const [reloadedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(reloadedOrder!.buyerId).toBe(linked.user.id);

    const [reloadedSession] = await db
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, session.id));
    expect(reloadedSession!.buyerId).toBe(linked.user.id);

    // The anonymous row is gone — nothing left holding an FK against it.
    expect(await anonRow(guest.user.id)).toBeUndefined();

    // And the buyer can actually see the order they placed as a guest.
    const res = await authedRequest(linked.sessionToken, "GET", `/api/v1/store/orders/${order.id}`);
    expect(res.statusCode).toBe(200);
  });

  it("lets a guest sign up with the same email they checked out with (self-collision)", async () => {
    const guest = await signInAnonymousTestUser();
    const email = `guest-selfcollide-${Date.now()}@example.com`;

    // What checkout does: stamps the customer's real email onto the guest row.
    await setGuestCheckoutEmail(guest.user.id, email);
    await insertPaidOrder(guest.user.id);

    // What the sign-up page does: prefills that same email.
    const linked = await linkAnonymousToNewAccount(guest.sessionToken, { email });

    expect(linked.user.email).toBe(email);
    expect(await anonRow(guest.user.id)).toBeUndefined();

    // The email is now owned by exactly one row: the real account.
    const holders = await db.select().from(user).where(eq(user.email, email));
    expect(holders).toHaveLength(1);
    expect(holders[0]!.id).toBe(linked.user.id);
  });

  it("still converts on a retry after a rejected sign-up attempt with the checkout email", async () => {
    const guest = await signInAnonymousTestUser();
    const email = `guest-retry-${Date.now()}@example.com`;
    await setGuestCheckoutEmail(guest.user.id, email);
    const { order } = await insertPaidOrder(guest.user.id);

    // First attempt is rejected by Better Auth (password too short). The
    // email-release hook has already run by then, so this asserts the guest
    // isn't wedged: a retry with the same email must still convert cleanly.
    const app = await getTestApp();
    const rejected = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: {
        "content-type": "application/json",
        "x-channel": "bushpop",
        cookie: `better-auth.session_token=${guest.sessionToken}`,
      },
      payload: { email, password: "short", name: "Test User" },
    });
    expect(rejected.statusCode).toBeGreaterThanOrEqual(400);

    const linked = await linkAnonymousToNewAccount(guest.sessionToken, { email });
    expect(linked.user.email).toBe(email);

    const [reloadedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(reloadedOrder!.buyerId).toBe(linked.user.id);
    expect(await anonRow(guest.user.id)).toBeUndefined();
  });

  it("re-parents a checkout session when the guest's cart is merged into an existing account cart", async () => {
    const listing = await createActiveTestListing(sellerId, { priceCents: 3000 });

    // Real account already has a cart in this channel — forces the merge-and-drop branch.
    const real = await signUpTestUser();
    await authedRequest(real.sessionToken, "POST", "/api/v1/store/cart/items", {
      listingId: listing.id,
    });

    const guest = await signInAnonymousTestUser();
    const { session, cart: guestCart } = await insertPaidOrder(guest.user.id);

    const app = await getTestApp();
    const signInRes = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: {
        "content-type": "application/json",
        "x-channel": "bushpop",
        cookie: `better-auth.session_token=${guest.sessionToken}`,
      },
      payload: { email: real.user.email, password: "TestPassword123!" },
    });
    expect(signInRes.statusCode).toBe(200);

    // Guest cart dropped, and its checkout session followed the buyer across
    // rather than dangling against a deleted cart.
    expect((await db.select().from(carts).where(eq(carts.id, guestCart.id)))[0]).toBeUndefined();

    const [reloadedSession] = await db
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, session.id));
    expect(reloadedSession!.buyerId).toBe(real.user.id);
    expect(reloadedSession!.cartId).not.toBe(guestCart.id);

    expect(await anonRow(guest.user.id)).toBeUndefined();
  });

  it("carries favourites and saved searches across, skipping ones the account already has", async () => {
    const shared = await createActiveTestListing(sellerId, { priceCents: 3000 });
    const guestOnly = await createActiveTestListing(sellerId, { priceCents: 5000 });

    const guest = await signInAnonymousTestUser();
    await db.insert(wishlists).values([
      { userId: guest.user.id, channelListingId: shared.id },
      { userId: guest.user.id, channelListingId: guestOnly.id },
    ]);
    await db.insert(savedSearches).values({
      userId: guest.user.id,
      channelId,
      query: "vintage denim",
      queryHash: "hash-guest-denim",
    });

    const linked = await linkAnonymousToNewAccount(guest.sessionToken);

    const favourites = await db.select().from(wishlists).where(eq(wishlists.userId, linked.user.id));
    expect(favourites.map((f) => f.channelListingId).sort()).toEqual([shared.id, guestOnly.id].sort());

    const searches = await db
      .select()
      .from(savedSearches)
      .where(and(eq(savedSearches.userId, linked.user.id), eq(savedSearches.queryHash, "hash-guest-denim")));
    expect(searches).toHaveLength(1);

    expect(await anonRow(guest.user.id)).toBeUndefined();
  });
});
