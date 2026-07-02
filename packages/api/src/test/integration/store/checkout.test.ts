import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { checkoutSessions, inventoryItems, channelListings, addresses, sellerProfiles } from "@bushpop/db/schema";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { authedRequest } from "../../helpers/http.js";

// ── Mock Stripe ──────────────────────────────────────────────────────────────
vi.mock("../../../lib/stripe.js", () => {
  const mockPaymentIntent = {
    id: "pi_test_mock123",
    client_secret: "pi_test_mock123_secret_abc",
    status: "requires_payment_method",
    amount: 0,
    currency: "aud",
    transfer_group: null,
    metadata: {},
  };

  const stripe = {
    paymentIntents: {
      create: vi.fn().mockResolvedValue(mockPaymentIntent),
      cancel: vi.fn().mockResolvedValue({ ...mockPaymentIntent, status: "canceled" }),
    },
    refunds: {
      create: vi.fn().mockResolvedValue({ id: "re_test_mock", amount: 0 }),
    },
  };

  return {
    getStripe: vi.fn(() => stripe),
    _resetStripe: vi.fn(),
    _mockStripe: stripe,
  };
});

// ── Mock BullMQ checkout-expiry worker (don't schedule real jobs in tests) ──
vi.mock("../../../workers/checkout-expiry.js", () => ({
  scheduleCheckoutExpiry: vi.fn().mockResolvedValue(undefined),
  startCheckoutExpiryWorker: vi.fn(),
  CHECKOUT_EXPIRY_QUEUE: "checkout-expiry",
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

async function makeStripeReadySeller(userId: string) {
  await db
    .update(sellerProfiles)
    .set({
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    })
    .where(eq(sellerProfiles.userId, userId));
}

async function createBuyerAddress(buyerId: string): Promise<string> {
  const [addr] = await db
    .insert(addresses)
    .values({
      userId: buyerId,
      line1: "1 Buyer Street",
      suburb: "Sydney",
      state: "NSW",
      postcode: "2000",
      country: "AU",
    })
    .returning();
  return addr!.id;
}

async function setupSellerWithCheckoutReadiness(userId: string) {
  // Grant seller role with default shipping address
  await grantSellerRole(userId, { withDefaultAddress: true });
  // Enable Stripe
  await makeStripeReadySeller(userId);
}

async function addListingToCart(
  buyerToken: string,
  listingId: string,
) {
  const res = await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", {
    listingId,
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Checkout API", () => {
  let buyerToken: string;
  let buyerId: string;
  let sellerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    const buyer = await signUpTestUser();
    buyerId = buyer.user.id;
    buyerToken = buyer.sessionToken;

    const seller = await signUpTestUser();
    sellerId = seller.user.id;
    await setupSellerWithCheckoutReadiness(sellerId);
  });

  describe("POST /api/v1/store/checkout — happy path", () => {
    it("creates checkout session, reserves inventory, returns clientSecret", async () => {
      const listing = await createActiveTestListing(sellerId, { priceCents: 5000 });
      await addListingToCart(buyerToken, listing.id);

      const addressId = await createBuyerAddress(buyerId);
      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessionId).toBeTruthy();
      expect(body.clientSecret).toBe("pi_test_mock123_secret_abc");
      expect(body.expiresAt).toBeTruthy();
      expect(body.status).toBe("payment_pending");
      expect(body.totals.subtotalCents).toBe(5000);
      expect(body.totals.currency).toBe("AUD");

      // Verify inventory was reserved
      const [inventoryItem] = await db
        .select({ availabilityStatus: inventoryItems.availabilityStatus })
        .from(inventoryItems)
        .innerJoin(channelListings, eq(channelListings.inventoryItemId, inventoryItems.id))
        .where(eq(channelListings.id, listing.id));

      expect(inventoryItem?.availabilityStatus).toBe("reserved");

      // Verify checkout_session was inserted before Stripe (by checking DB record exists)
      const [session] = await db
        .select()
        .from(checkoutSessions)
        .where(eq(checkoutSessions.id, body.sessionId));

      expect(session).toBeTruthy();
      expect(session!.status).toBe("payment_pending");
      expect(session!.stripePaymentIntentId).toBe("pi_test_mock123");
    });

    // THE Phase-1 money acceptance criterion (task 9): $200 item on a
    // Medium prepaid label → fee $3.80 (175bps + 30c) + label $10.95 →
    // seller receives EXACTLY $185.25. Buyer pays no shipping on prepaid.
    it("$200 Medium prepaid → sellerProceedsCents === 18525", async () => {
      const listing = await createActiveTestListing(sellerId, { priceCents: 20_000 });
      await db.execute(
        `UPDATE inventory_items SET shipping_option = 'prepaid', parcel_size = 'medium', shipping_class = 'm'
         WHERE id = '${listing.inventoryItemId}'`,
      );
      await addListingToCart(buyerToken, listing.id);

      const addressId = await createBuyerAddress(buyerId);
      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });

      expect(res.statusCode).toBe(200);
      const { totals } = res.json();
      expect(totals.subtotalCents).toBe(20_000);
      expect(totals.shippingCents).toBe(0); // prepaid = free shipping for the buyer
      expect(totals.totalCents).toBe(20_000);
      expect(totals.platformFeeCents).toBe(380); // 175bps + 30c
      expect(totals.sellerProceedsCents).toBe(18_525); // exactly $185.25
    });

    it("charges the config commission (175bps + 30c), not the old channel bps", async () => {
      const listing = await createActiveTestListing(sellerId, { priceCents: 5000 });
      await addListingToCart(buyerToken, listing.id);
      const addressId = await createBuyerAddress(buyerId);
      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });

      const { totals } = res.json();
      // 5000 * 1.75% = 87.5 → 88 + 30 = 118 (old 8% model would say 400)
      expect(totals.platformFeeCents).toBe(118);
      // Legacy item (shipping_option NULL) = buyer_pays: seller keeps shipping
      // m rate 1095: proceeds = 5000 + 1095 - 118 = 5977
      expect(totals.shippingCents).toBe(1095);
      expect(totals.sellerProceedsCents).toBe(5977);
    });

    it("calculates multi-item shipping: highest class + $3 per additional item", async () => {
      // Create two listings for the same seller
      const listingM = await createActiveTestListing(sellerId, { priceCents: 3000 });
      const listingS = await createActiveTestListing(sellerId, { priceCents: 2000 });

      // Set shipping classes directly on inventory items
      await db.execute(
        `UPDATE inventory_items SET shipping_class = 'm' WHERE id IN (
          SELECT inventory_item_id FROM channel_listings WHERE id = '${listingM.inventoryItemId}'
        )`,
      );
      await db.execute(
        `UPDATE inventory_items SET shipping_class = 's' WHERE id IN (
          SELECT inventory_item_id FROM channel_listings WHERE id = '${listingS.inventoryItemId}'
        )`,
      );

      await addListingToCart(buyerToken, listingM.id);
      await addListingToCart(buyerToken, listingS.id);

      const addressId = await createBuyerAddress(buyerId);
      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // m = 1095 (parcel-aligned, Phase 1 task 1), + 300 surcharge = 1395
      expect(body.totals.shippingCents).toBe(1395);
      expect(body.totals.subtotalCents).toBe(5000);
    });
  });

  describe("POST /api/v1/store/checkout — reuse existing active session", () => {
    it("returns existing session on retry (no new PaymentIntent)", async () => {
      const { getStripe } = await import("../../../lib/stripe.js");
      const stripe = getStripe() as unknown as {
        paymentIntents: { create: ReturnType<typeof vi.fn> };
      };

      const listing = await createActiveTestListing(sellerId, { priceCents: 5000 });
      await addListingToCart(buyerToken, listing.id);
      const addressId = await createBuyerAddress(buyerId);

      // First checkout
      const res1 = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });
      expect(res1.statusCode).toBe(200);
      const session1 = res1.json();

      // Second checkout — should reuse
      const res2 = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });
      expect(res2.statusCode).toBe(200);
      const session2 = res2.json();

      expect(session2.sessionId).toBe(session1.sessionId);
      // Stripe create should only have been called once
      expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /api/v1/store/checkout — validation errors", () => {
    it("returns 404 when cart is empty", async () => {
      const addressId = await createBuyerAddress(buyerId);
      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 409 LISTING_UNAVAILABLE when listing is paused", async () => {
      const listing = await createActiveTestListing(sellerId, { priceCents: 5000 });
      await addListingToCart(buyerToken, listing.id);

      // Pause the listing after it was added to cart
      await db
        .update(channelListings)
        .set({ status: "paused" })
        .where(eq(channelListings.id, listing.id));

      const addressId = await createBuyerAddress(buyerId);
      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });

      expect(res.statusCode).toBe(409);
    });

    it("returns 422 PRICE_CHANGED when listing price changed after cart add", async () => {
      const listing = await createActiveTestListing(sellerId, { priceCents: 5000 });
      await addListingToCart(buyerToken, listing.id);

      // Change the listing price
      await db
        .update(channelListings)
        .set({ priceCents: 7500 })
        .where(eq(channelListings.id, listing.id));

      const addressId = await createBuyerAddress(buyerId);
      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().message).toMatch(/price/i);
    });

    it("returns 422 SELLER_NOT_READY when seller lacks Stripe onboarding", async () => {
      // Create a seller without Stripe enabled
      const notReadySeller = await signUpTestUser();
      await grantSellerRole(notReadySeller.user.id, { withDefaultAddress: true });
      // Don't enable Stripe

      const listing = await createActiveTestListing(notReadySeller.user.id, { priceCents: 5000 });
      await addListingToCart(buyerToken, listing.id);

      const addressId = await createBuyerAddress(buyerId);
      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().message).toMatch(/stripe/i);
    });

    it("returns 422 when shipping address does not belong to buyer", async () => {
      const listing = await createActiveTestListing(sellerId, { priceCents: 5000 });
      await addListingToCart(buyerToken, listing.id);

      // Create address belonging to someone else
      const otherUser = await signUpTestUser();
      const otherAddressId = await createBuyerAddress(otherUser.user.id);

      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: otherAddressId,
      });

      expect(res.statusCode).toBe(422);
    });
  });

  // ADR-015 Sprint 1b W1: cart is multi-seller but the current checkout path
  // only supports single-seller. assertSingleSellerCart rejects 2-seller carts
  // with 422 MULTI_SELLER_CHECKOUT_UNSUPPORTED until W2 wires up order_groups.
  // TODO ADR-015-W5: delete this block when multi-seller checkout ships.
  describe("POST /api/v1/store/checkout — multi-seller cart rejection (W1 scaffold)", () => {
    it("returns 422 MULTI_SELLER_CHECKOUT_UNSUPPORTED for a cart with 2 sellers", async () => {
      const seller2 = await signUpTestUser();
      await setupSellerWithCheckoutReadiness(seller2.user.id);

      const listing1 = await createActiveTestListing(sellerId, { priceCents: 3000 });
      const listing2 = await createActiveTestListing(seller2.user.id, { priceCents: 4000 });

      await addListingToCart(buyerToken, listing1.id);
      await addListingToCart(buyerToken, listing2.id);

      const addressId = await createBuyerAddress(buyerId);
      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe("MULTI_SELLER_CHECKOUT_UNSUPPORTED");
    });
  });

  describe("POST /api/v1/store/checkout — reservation conflict", () => {
    it("returns 409 RESERVATION_CONFLICT when inventory is already reserved", async () => {
      const listing = await createActiveTestListing(sellerId, { priceCents: 5000 });

      // Reserve the inventory item directly (simulating concurrent checkout)
      await db
        .update(inventoryItems)
        .set({ availabilityStatus: "reserved" })
        .where(
          eq(
            inventoryItems.id,
            listing.inventoryItemId,
          ),
        );

      await addListingToCart(buyerToken, listing.id);
      const addressId = await createBuyerAddress(buyerId);
      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });

      expect(res.statusCode).toBe(409);
    });
  });

  describe("POST /api/v1/store/checkout — Stripe failure cleanup", () => {
    it("sets session to failed and releases reservations when Stripe create fails", async () => {
      const { getStripe } = await import("../../../lib/stripe.js");
      const stripe = getStripe() as unknown as {
        paymentIntents: { create: ReturnType<typeof vi.fn> };
      };

      stripe.paymentIntents.create.mockRejectedValueOnce(
        new Error("Stripe: card_error"),
      );

      const listing = await createActiveTestListing(sellerId, { priceCents: 5000 });
      await addListingToCart(buyerToken, listing.id);
      const addressId = await createBuyerAddress(buyerId);

      const res = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });

      expect(res.statusCode).toBe(502);

      // Inventory should be released
      const [item] = await db
        .select({ availabilityStatus: inventoryItems.availabilityStatus })
        .from(inventoryItems)
        .innerJoin(channelListings, eq(channelListings.inventoryItemId, inventoryItems.id))
        .where(eq(channelListings.id, listing.id));

      expect(item?.availabilityStatus).toBe("available");

      // Session should be in failed status
      const [session] = await db
        .select({ status: checkoutSessions.status })
        .from(checkoutSessions)
        .where(eq(checkoutSessions.buyerId, buyerId));

      expect(session?.status).toBe("failed");
    });
  });

  describe("GET /api/v1/store/checkout/:id", () => {
    it("returns the checkout session for the buyer", async () => {
      const listing = await createActiveTestListing(sellerId, { priceCents: 5000 });
      await addListingToCart(buyerToken, listing.id);
      const addressId = await createBuyerAddress(buyerId);

      const checkoutRes = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });
      const { sessionId } = checkoutRes.json();

      const getRes = await authedRequest(buyerToken, "GET", `/api/v1/store/checkout/${sessionId}`);
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().id).toBe(sessionId);
    });

    it("returns 404 for a session belonging to another buyer", async () => {
      const listing = await createActiveTestListing(sellerId, { priceCents: 5000 });
      await addListingToCart(buyerToken, listing.id);
      const addressId = await createBuyerAddress(buyerId);

      const checkoutRes = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });
      const { sessionId } = checkoutRes.json();

      // Another buyer tries to access it
      const otherBuyer = await signUpTestUser();
      const getRes = await authedRequest(otherBuyer.sessionToken, "GET", `/api/v1/store/checkout/${sessionId}`);
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe("POST /api/v1/store/checkout/:id/cancel", () => {
    it("cancels from 'created' — releases inventory, cancels PaymentIntent", async () => {
      const { getStripe } = await import("../../../lib/stripe.js");
      const stripe = getStripe() as unknown as {
        paymentIntents: { cancel: ReturnType<typeof vi.fn> };
      };

      const listing = await createActiveTestListing(sellerId, { priceCents: 5000 });
      await addListingToCart(buyerToken, listing.id);
      const addressId = await createBuyerAddress(buyerId);

      const checkoutRes = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });
      const { sessionId } = checkoutRes.json();

      const cancelRes = await authedRequest(buyerToken, "POST", `/api/v1/store/checkout/${sessionId}/cancel`);
      expect(cancelRes.statusCode).toBe(200);

      // Session should be abandoned
      const [session] = await db
        .select({ status: checkoutSessions.status })
        .from(checkoutSessions)
        .where(eq(checkoutSessions.id, sessionId));
      expect(session?.status).toBe("abandoned");

      // Inventory should be released
      const [item] = await db
        .select({ availabilityStatus: inventoryItems.availabilityStatus })
        .from(inventoryItems)
        .innerJoin(channelListings, eq(channelListings.inventoryItemId, inventoryItems.id))
        .where(eq(channelListings.id, listing.id));
      expect(item?.availabilityStatus).toBe("available");

      // Stripe cancel should have been called
      expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_test_mock123");
    });

    it("cancels from 'payment_pending' — releases inventory, cancels PaymentIntent", async () => {
      const listing = await createActiveTestListing(sellerId, { priceCents: 5000 });
      await addListingToCart(buyerToken, listing.id);
      const addressId = await createBuyerAddress(buyerId);

      const checkoutRes = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });
      const { sessionId } = checkoutRes.json();

      // Transition to payment_pending directly in DB
      await db
        .update(checkoutSessions)
        .set({ status: "payment_pending" })
        .where(eq(checkoutSessions.id, sessionId));

      const cancelRes = await authedRequest(buyerToken, "POST", `/api/v1/store/checkout/${sessionId}/cancel`);
      expect(cancelRes.statusCode).toBe(200);

      const [session] = await db
        .select({ status: checkoutSessions.status })
        .from(checkoutSessions)
        .where(eq(checkoutSessions.id, sessionId));
      expect(session?.status).toBe("abandoned");
    });

    it("returns 422 when trying to cancel from 'requires_action'", async () => {
      const listing = await createActiveTestListing(sellerId, { priceCents: 5000 });
      await addListingToCart(buyerToken, listing.id);
      const addressId = await createBuyerAddress(buyerId);

      const checkoutRes = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addressId,
      });
      const { sessionId } = checkoutRes.json();

      // Transition to requires_action
      await db
        .update(checkoutSessions)
        .set({ status: "requires_action" })
        .where(eq(checkoutSessions.id, sessionId));

      const cancelRes = await authedRequest(buyerToken, "POST", `/api/v1/store/checkout/${sessionId}/cancel`);
      expect(cancelRes.statusCode).toBe(422);
      expect(cancelRes.json().message).toMatch(/requires_action/i);
    });

    it("returns 401 when unauthenticated", async () => {
      const { getTestApp } = await import("../../helpers/http.js");
      const app = await getTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/store/checkout/01JFAKE0000000000000000000/cancel",
        headers: { "x-channel": "bushpop" },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});

describe("Checkout — expiry via expireCheckoutSession()", () => {
  it("transitions to expired, releases inventory, cancels PaymentIntent", async () => {
    vi.clearAllMocks();

    const buyer = await signUpTestUser();
    const seller = await signUpTestUser();
    await grantSellerRole(seller.user.id, { withDefaultAddress: true });
    await db
      .update(sellerProfiles)
      .set({ stripeChargesEnabled: true, stripePayoutsEnabled: true })
      .where(eq(sellerProfiles.userId, seller.user.id));

    const listing = await createActiveTestListing(seller.user.id, { priceCents: 5000 });

    // Insert a checkout session manually in 'created' status with stripePaymentIntentId
    const addressId = await db
      .insert(addresses)
      .values({
        userId: buyer.user.id,
        line1: "1 Test St",
        suburb: "Sydney",
        state: "NSW",
        postcode: "2000",
        country: "AU",
      })
      .returning()
      .then((r) => r[0]!.id);

    // Add to cart first
    await authedRequest(buyer.sessionToken, "POST", "/api/v1/store/cart/items", {
      listingId: listing.id,
    });

    // Initiate checkout
    const checkoutRes = await authedRequest(buyer.sessionToken, "POST", "/api/v1/store/checkout", {
      shippingAddressId: addressId,
    });
    expect(checkoutRes.statusCode).toBe(200);
    const { sessionId } = checkoutRes.json();

    // Import and call expiry function directly
    const { expireCheckoutSession } = await import("../../../routes/v1/store/checkout/service.js");
    const { getStripe } = await import("../../../lib/stripe.js");
    const stripe = getStripe() as unknown as {
      paymentIntents: { cancel: ReturnType<typeof vi.fn> };
    };

    const result = await expireCheckoutSession(sessionId);
    expect(result).toBe(true);

    // Session should be expired
    const [session] = await db
      .select({ status: checkoutSessions.status })
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, sessionId));
    expect(session?.status).toBe("expired");

    // Inventory should be released
    const [item] = await db
      .select({ availabilityStatus: inventoryItems.availabilityStatus })
      .from(inventoryItems)
      .innerJoin(channelListings, eq(channelListings.inventoryItemId, inventoryItems.id))
      .where(eq(channelListings.id, listing.id));
    expect(item?.availabilityStatus).toBe("available");

    // Stripe cancel should be called
    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_test_mock123");
  });

  it("is idempotent — returns false when session already expired", async () => {
    const { expireCheckoutSession } = await import("../../../routes/v1/store/checkout/service.js");

    // Call with a non-existent session
    const result = await expireCheckoutSession("01JFAKE0000000000000000000");
    expect(result).toBe(false);
  });
});

describe("Checkout — concurrent race condition", () => {
  it("two simultaneous checkouts: one succeeds, one 409 (reservation conflict)", async () => {
    vi.clearAllMocks();

    const buyer1 = await signUpTestUser();
    const buyer2 = await signUpTestUser();
    const seller = await signUpTestUser();
    await grantSellerRole(seller.user.id, { withDefaultAddress: true });
    await db
      .update(sellerProfiles)
      .set({ stripeChargesEnabled: true, stripePayoutsEnabled: true })
      .where(eq(sellerProfiles.userId, seller.user.id));

    const listing = await createActiveTestListing(seller.user.id, { priceCents: 5000 });

    // Both buyers add the same listing to their carts
    await authedRequest(buyer1.sessionToken, "POST", "/api/v1/store/cart/items", {
      listingId: listing.id,
    });
    await authedRequest(buyer2.sessionToken, "POST", "/api/v1/store/cart/items", {
      listingId: listing.id,
    });

    const addr1 = await createBuyerAddress(buyer1.user.id);
    const addr2 = await createBuyerAddress(buyer2.user.id);

    // Fire both checkouts simultaneously
    const [res1, res2] = await Promise.all([
      authedRequest(buyer1.sessionToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addr1,
      }),
      authedRequest(buyer2.sessionToken, "POST", "/api/v1/store/checkout", {
        shippingAddressId: addr2,
      }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    // One succeeds (200), one conflicts (409)
    expect(statuses).toEqual([200, 409]);
  });
});

