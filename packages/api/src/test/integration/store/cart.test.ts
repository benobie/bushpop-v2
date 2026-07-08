import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { sellerProfiles, addresses, user as userTable } from "@bushpop/db/schema";
import { signUpTestUser, signInAnonymousTestUser, grantSellerRole } from "../../helpers/auth.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { authedRequest } from "../../helpers/http.js";

describe("Cart API", () => {
  let buyerToken: string;
  let buyerId: string;
  let sellerId: string;
  let sellerToken: string;

  beforeEach(async () => {
    const buyer = await signUpTestUser();
    buyerId = buyer.user.id;
    buyerToken = buyer.sessionToken;

    const seller = await signUpTestUser();
    sellerId = seller.user.id;
    sellerToken = seller.sessionToken;
    await grantSellerRole(sellerId);
  });

  describe("POST /api/v1/store/cart/items", () => {
    it("adds an active listing to cart", async () => {
      const listing = await createActiveTestListing(sellerId, { priceCents: 7500 });

      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", {
        listingId: listing.id,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).not.toHaveProperty("sellerId");
      expect(body.buyerId).toBe(buyerId);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].channelListingId).toBe(listing.id);
      expect(body.items[0].priceCents).toBe(7500);
    });

    it("snapshots listing price at time of add", async () => {
      const listing = await createActiveTestListing(sellerId, { priceCents: 9900 });

      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", {
        listingId: listing.id,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items[0].priceCents).toBe(9900);
      expect(body.items[0].currency).toBe("AUD");
    });

    it("returns 409 when adding the same listing twice", async () => {
      const listing = await createActiveTestListing(sellerId);

      await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", {
        listingId: listing.id,
      });

      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", {
        listingId: listing.id,
      });

      expect(res.statusCode).toBe(409);
    });

    // ADR-015 Sprint 1b W1: cart is multi-seller. Previously this test asserted
    // that adding items from a second seller returned 422 SELLER_MISMATCH; the
    // constraint has moved from the cart layer to the checkout layer.
    it("accepts items from multiple sellers in a single cart", async () => {
      const seller2 = await signUpTestUser();
      await grantSellerRole(seller2.user.id, { handle: `seller2-${seller2.user.id.slice(-4)}` });

      const listing1 = await createActiveTestListing(sellerId);
      const listing2 = await createActiveTestListing(seller2.user.id);

      // Add first listing (seller 1)
      const first = await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", {
        listingId: listing1.id,
      });
      expect(first.statusCode).toBe(200);

      // Add second listing (seller 2) — W1 allows this
      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", {
        listingId: listing2.id,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(2);
      expect(body).not.toHaveProperty("sellerId");
      const listingIds = body.items.map((i: { channelListingId: string }) => i.channelListingId).sort();
      expect(listingIds).toEqual([listing1.id, listing2.id].sort());
    });

    it("rejects adding a paused listing", async () => {
      // Create via DB directly in paused state (bypass activation guards)
      const { db: dbClient } = await import("@bushpop/db/client");
      const { channelListings } = await import("@bushpop/db/schema");
      const listing = await createActiveTestListing(sellerId);

      // Pause it
      await dbClient
        .update(channelListings)
        .set({ status: "paused" })
        .where(eq(channelListings.id, listing.id));

      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", {
        listingId: listing.id,
      });

      expect(res.statusCode).toBe(422);
    });

    it("rejects adding a sold listing", async () => {
      const { db: dbClient } = await import("@bushpop/db/client");
      const { channelListings } = await import("@bushpop/db/schema");
      const listing = await createActiveTestListing(sellerId);

      await dbClient
        .update(channelListings)
        .set({ status: "sold" })
        .where(eq(channelListings.id, listing.id));

      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", {
        listingId: listing.id,
      });

      expect(res.statusCode).toBe(422);
    });

    it("returns 401 when unauthenticated", async () => {
      const listing = await createActiveTestListing(sellerId);
      const { getTestApp } = await import("../../helpers/http.js");
      const app = await getTestApp();

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/store/cart/items",
        headers: { "content-type": "application/json", "x-channel": "bushpop" },
        payload: { listingId: listing.id },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/v1/store/cart", () => {
    it("returns null when cart is empty", async () => {
      const res = await authedRequest(buyerToken, "GET", "/api/v1/store/cart");

      expect(res.statusCode).toBe(200);
      expect(res.json()).toBeNull();
    });

    it("returns cart with items after adding", async () => {
      const listing = await createActiveTestListing(sellerId);
      await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", {
        listingId: listing.id,
      });

      const res = await authedRequest(buyerToken, "GET", "/api/v1/store/cart");

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(1);
      expect(body).not.toHaveProperty("sellerId");
    });

    it("enriches items with title/coverImage/handle from the listing — U1 §2.1", async () => {
      const listing = await createActiveTestListing(sellerId, { title: "Enriched Cart Item" });
      await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", {
        listingId: listing.id,
      });

      const res = await authedRequest(buyerToken, "GET", "/api/v1/store/cart");
      expect(res.statusCode).toBe(200);
      const item = res.json().items[0];
      expect(item.title).toBe("Enriched Cart Item");
      expect(item.handle).toBe(listing.handle);
      expect(item.coverImage).toContain(`items/${listing.inventoryItemId}/primary.jpg`);
    });
  });

  describe("DELETE /api/v1/store/cart/items/:id", () => {
    it("removes a cart item and deletes the cart when empty", async () => {
      const listing = await createActiveTestListing(sellerId);
      const addRes = await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", {
        listingId: listing.id,
      });
      const cartItemId = addRes.json().items[0].id;

      const delRes = await authedRequest(
        buyerToken,
        "DELETE",
        `/api/v1/store/cart/items/${cartItemId}`,
      );
      expect(delRes.statusCode).toBe(204);

      // Cart should be gone
      const cartRes = await authedRequest(buyerToken, "GET", "/api/v1/store/cart");
      expect(cartRes.json()).toBeNull();
    });

    it("returns 404 for non-existent cart item", async () => {
      const fakeId = "01JFAKE0000000000000000000";
      const res = await authedRequest(
        buyerToken,
        "DELETE",
        `/api/v1/store/cart/items/${fakeId}`,
      );
      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/v1/store/cart", () => {
    it("clears the cart", async () => {
      const listing = await createActiveTestListing(sellerId);
      await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", {
        listingId: listing.id,
      });

      const delRes = await authedRequest(buyerToken, "DELETE", "/api/v1/store/cart");
      expect(delRes.statusCode).toBe(204);

      const cartRes = await authedRequest(buyerToken, "GET", "/api/v1/store/cart");
      expect(cartRes.json()).toBeNull();
    });

    it("is idempotent when cart does not exist", async () => {
      const res = await authedRequest(buyerToken, "DELETE", "/api/v1/store/cart");
      expect(res.statusCode).toBe(204);
    });
  });
});

describe("Guest cart (BF-08)", () => {
  let sellerId: string;
  let sellerToken: string;

  beforeEach(async () => {
    const seller = await signUpTestUser();
    sellerId = seller.user.id;
    sellerToken = seller.sessionToken;
    await grantSellerRole(sellerId);
  });

  it("lets an anonymous session add to cart and persists it", async () => {
    const listing = await createActiveTestListing(sellerId, { priceCents: 6000 });
    const guest = await signInAnonymousTestUser();
    expect(guest.user.isAnonymous).toBe(true);

    const addRes = await authedRequest(guest.sessionToken, "POST", "/api/v1/store/cart/items", {
      listingId: listing.id,
    });
    expect(addRes.statusCode).toBe(200);
    expect(addRes.json().buyerId).toBe(guest.user.id);

    const getRes = await authedRequest(guest.sessionToken, "GET", "/api/v1/store/cart");
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().items).toHaveLength(1);

    // The anonymous user is a real row — every buyer-owned FK works unmodified.
    const [row] = await db.select().from(userTable).where(eq(userTable.id, guest.user.id));
    expect(row?.isAnonymous).toBe(true);
  });

  it("still 401s a request with no session at all (no auto-bootstrap server-side)", async () => {
    const listing = await createActiveTestListing(sellerId);
    const { getTestApp } = await import("../../helpers/http.js");
    const app = await getTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/store/cart",
      headers: { "x-channel": "bushpop" },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("Seller Readiness — listing activation", () => {
  let userId: string;
  let sessionToken: string;
  let channelId: string;

  beforeEach(async () => {
    const { user, sessionToken: token } = await signUpTestUser();
    userId = user.id;
    sessionToken = token;
    await grantSellerRole(userId);

    const { getBushpopChannel } = await import("../../helpers/get-channel.js");
    const channel = await getBushpopChannel();
    channelId = channel.id;
  });

  async function createReadyItem() {
    const { createTestInventoryItem } = await import("../../helpers/create-inventory-item.js");
    const { inventoryItemImages } = await import("@bushpop/db/schema");

    const item = await createTestInventoryItem(userId, { lifecycleState: "for_sale" });

    await db.insert(inventoryItemImages).values({
      inventoryItemId: item.id,
      storageKey: `items/${item.id}/primary.jpg`,
      status: "ready",
      confirmedAt: new Date(),
    });

    return item;
  }

  async function setSellerShippingAddress(sellerUserId: string) {
    // Create an address and set it as the seller's default shipping address
    const [addr] = await db
      .insert(addresses)
      .values({
        userId: sellerUserId,
        line1: "1 Test Street",
        suburb: "Sydney",
        state: "NSW",
        postcode: "2000",
        country: "AU",
      })
      .returning();

    await db
      .update(sellerProfiles)
      .set({ defaultShippingAddressId: addr!.id })
      .where(eq(sellerProfiles.userId, sellerUserId));

    return addr!;
  }

  it("blocks listing activation when no default shipping address is set", async () => {
    const item = await createReadyItem();

    const createRes = await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
      inventoryItemId: item.id,
      channelId,
      title: "No Address Listing",
      priceCents: 5000,
    });
    const listing = createRes.json();

    const res = await authedRequest(
      sessionToken,
      "PATCH",
      `/api/v1/seller/listings/${listing.id}/status`,
      { to: "active", version: 1 },
    );

    expect(res.statusCode).toBe(422);
    expect(res.json().message).toMatch(/shipping address/i);
  });

  it("blocks listing activation when vacation mode is enabled", async () => {
    await setSellerShippingAddress(userId);

    // Enable vacation mode
    await db
      .update(sellerProfiles)
      .set({ vacationMode: true })
      .where(eq(sellerProfiles.userId, userId));

    const item = await createReadyItem();

    const createRes = await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
      inventoryItemId: item.id,
      channelId,
      title: "Vacation Blocked Listing",
      priceCents: 5000,
    });
    const listing = createRes.json();

    const res = await authedRequest(
      sessionToken,
      "PATCH",
      `/api/v1/seller/listings/${listing.id}/status`,
      { to: "active", version: 1 },
    );

    expect(res.statusCode).toBe(422);
    expect(res.json().message).toMatch(/vacation/i);
  });

  it("allows listing activation WITHOUT Stripe onboarding (Stripe is not a listing prerequisite)", async () => {
    await setSellerShippingAddress(userId);

    // Stripe fields remain false (defaults) — seller has NOT completed Stripe
    // This must succeed — Stripe is checked at checkout (Tier 2), not activation (Tier 1)

    const item = await createReadyItem();

    const createRes = await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
      inventoryItemId: item.id,
      channelId,
      title: "Pre-Stripe Listing",
      priceCents: 5000,
    });
    const listing = createRes.json();

    const res = await authedRequest(
      sessionToken,
      "PATCH",
      `/api/v1/seller/listings/${listing.id}/status`,
      { to: "active", version: 1 },
    );

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("active");
  });
});
