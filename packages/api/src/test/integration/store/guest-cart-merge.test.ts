import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { carts, cartItems } from "@bushpop/db/schema";
import {
  signUpTestUser,
  signInAnonymousTestUser,
  linkAnonymousToNewAccount,
  grantSellerRole,
} from "../../helpers/auth.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { authedRequest } from "../../helpers/http.js";

/**
 * BF-08 — when a guest with a cart signs up for a real account, the cart
 * (and anything else keyed to the anonymous user id) should carry over
 * rather than silently vanishing. mergeAnonymousIdentity runs inside Better
 * Auth's onLinkAccount hook (lib/auth.ts), triggered here via the real
 * sign-up/email endpoint while an anonymous session cookie is attached.
 */
describe("Guest cart merge on sign-up (BF-08)", () => {
  let sellerId: string;

  beforeEach(async () => {
    const seller = await signUpTestUser();
    sellerId = seller.user.id;
    await grantSellerRole(sellerId);
  });

  it("re-parents the guest's cart to the new account when the new account has no cart", async () => {
    const listing = await createActiveTestListing(sellerId, { priceCents: 4200 });
    const guest = await signInAnonymousTestUser();

    await authedRequest(guest.sessionToken, "POST", "/api/v1/store/cart/items", {
      listingId: listing.id,
    });

    const linked = await linkAnonymousToNewAccount(guest.sessionToken);

    // Anonymous user's cart is gone…
    const [anonCart] = await db.select().from(carts).where(eq(carts.buyerId, guest.user.id));
    expect(anonCart).toBeUndefined();

    // …and the new account now owns it with the item intact.
    const res = await authedRequest(linked.sessionToken, "GET", "/api/v1/store/cart");
    expect(res.statusCode).toBe(200);
    expect(res.json().buyerId).toBe(linked.user.id);
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0].channelListingId).toBe(listing.id);
  });

  it("merges items into an existing real-account cart without duplicating a shared listing", async () => {
    const listingA = await createActiveTestListing(sellerId, { priceCents: 3000 });
    const listingB = await createActiveTestListing(sellerId, { priceCents: 5000 });

    // Real account already shopping with listingA in its cart.
    const real = await signUpTestUser();
    await authedRequest(real.sessionToken, "POST", "/api/v1/store/cart/items", {
      listingId: listingA.id,
    });

    // Guest independently adds listingA (duplicate) and listingB.
    const guest = await signInAnonymousTestUser();
    await authedRequest(guest.sessionToken, "POST", "/api/v1/store/cart/items", {
      listingId: listingA.id,
    });
    await authedRequest(guest.sessionToken, "POST", "/api/v1/store/cart/items", {
      listingId: listingB.id,
    });

    // Guest signs in to the REAL account (not a fresh sign-up) — anonymous
    // plugin's onLinkAccount also fires on /sign-in/email while carrying an
    // anonymous cookie, exercising the "existing cart" merge branch.
    const app = (await import("../../helpers/http.js")).getTestApp;
    const server = await app();
    const signInRes = await server.inject({
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
    const cookies = signInRes.cookies;
    const sessionCookie = cookies.find((c: { name: string }) => c.name === "better-auth.session_token");
    expect(sessionCookie).toBeDefined();

    // Guest's cart is gone, no orphan row left behind.
    const [anonCart] = await db.select().from(carts).where(eq(carts.buyerId, guest.user.id));
    expect(anonCart).toBeUndefined();

    const res = await authedRequest(sessionCookie!.value as string, "GET", "/api/v1/store/cart");
    expect(res.statusCode).toBe(200);
    expect(res.json().buyerId).toBe(real.user.id);

    const listingIds = res
      .json()
      .items.map((i: { channelListingId: string }) => i.channelListingId)
      .sort();
    expect(listingIds).toEqual([listingA.id, listingB.id].sort());

    // No duplicate cart_items row for listingA under the real cart.
    const [realCart] = await db.select().from(carts).where(eq(carts.buyerId, real.user.id));
    const items = await db.select().from(cartItems).where(eq(cartItems.cartId, realCart!.id));
    expect(items).toHaveLength(2);
  });

  it("leaves the new account untouched when the guest never built a cart", async () => {
    const guest = await signInAnonymousTestUser();
    const linked = await linkAnonymousToNewAccount(guest.sessionToken);

    const res = await authedRequest(linked.sessionToken, "GET", "/api/v1/store/cart");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });
});
