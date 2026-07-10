/**
 * Phase 2A — End-to-End Smoke Test
 *
 * Happy-path only: Create seller → inventory + listing → buyer → cart →
 * checkout → payment webhook → verify order/payout/jobs → seller ships →
 * tracking webhook → verify shipped.
 *
 * Does NOT re-test error paths, race conditions, idempotency, or cancellation;
 * those are covered in Steps 2–7 integration tests.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  orders,
  payoutHolds,
  inventoryItems,
  channelListings,
  cartItems,
  carts,
} from "@bushpop/db/schema";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { authedRequest } from "../../helpers/http.js";
import { createStripeReadySeller } from "../../helpers/stripe-mock.js";

// ── Mock Stripe ───────────────────────────────────────────────────────────────

vi.mock("../../../lib/stripe.js", () => {
  const mockPaymentIntent = {
    id: "pi_smoke_test_mock",
    client_secret: "pi_smoke_test_mock_secret",
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
      create: vi.fn().mockResolvedValue({ id: "re_smoke_test_mock", amount: 0 }),
    },
    transfers: {
      create: vi.fn().mockResolvedValue({ id: "tr_smoke_test_mock", amount: 0, currency: "aud" }),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };

  return {
    getStripe: vi.fn(() => stripe),
    _resetStripe: vi.fn(),
    _mockStripe: stripe,
  };
});

// ── Mock BullMQ checkout-expiry (don't schedule real Redis jobs in tests) ────

vi.mock("../../../workers/checkout-expiry.js", () => ({
  scheduleCheckoutExpiry: vi.fn().mockResolvedValue(undefined),
  startCheckoutExpiryWorker: vi.fn(),
  CHECKOUT_EXPIRY_QUEUE: "checkout-expiry",
}));

// ── Mock email + shipping-label workers (don't create real BullMQ queues) ──

vi.mock("../../../workers/email.js", () => ({
  enqueueEmail: vi.fn().mockResolvedValue(undefined),
  startEmailWorker: vi.fn(),
  EMAIL_QUEUE: "email",
}));

vi.mock("../../../workers/shipping-label.js", () => ({
  enqueueShippingLabel: vi.fn().mockResolvedValue(undefined),
  startShippingLabelWorker: vi.fn(),
  SHIPPING_LABEL_QUEUE: "shipping-label",
}));

// ── Smoke test ────────────────────────────────────────────────────────────────

describe("Phase 2A — E2E smoke test (happy path)", () => {
  let sellerId: string;
  let sellerToken: string;
  let buyerId: string;
  let buyerToken: string;
  let listingId: string;

  beforeAll(async () => {
    vi.clearAllMocks();
  });

  it("full purchase flow: checkout → payment → ship → tracking", async () => {
    // ── Step 1: Create seller (Stripe-ready, shipping address set) ────────────
    const seller = await signUpTestUser();
    sellerId = seller.user.id;
    sellerToken = seller.sessionToken;

    // Grant seller role with a default shipping address
    await grantSellerRole(sellerId, { withDefaultAddress: true });

    // Set Stripe fields so seller passes readiness check
    await createStripeReadySeller(sellerId);

    // ── Step 2: Create inventory + listing ────────────────────────────────────
    const listing = await createActiveTestListing(sellerId, { priceCents: 4500 });
    listingId = listing.id;

    // ── Step 3: Create buyer ──────────────────────────────────────────────────
    const buyer = await signUpTestUser();
    buyerId = buyer.user.id;
    buyerToken = buyer.sessionToken;

    // ── Step 4: Buyer creates a shipping address ──────────────────────────────
    const addrRes = await authedRequest(buyerToken, "POST", "/api/v1/addresses", {
      line1: "42 Buyer Lane",
      suburb: "Melbourne",
      state: "VIC",
      postcode: "3000",
      country: "AU",
    });
    expect(addrRes.statusCode, "create buyer address").toBe(201);
    const { id: shippingAddressId } = addrRes.json();

    // ── Step 5: Add listing to cart ───────────────────────────────────────────
    const cartRes = await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", {
      listingId,
    });
    expect(cartRes.statusCode, "add to cart").toBe(200);

    // ── Step 6: Checkout — verify reservation + DB row before Stripe call ─────
    const checkoutRes = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
      shippingAddressId,
    });
    expect(checkoutRes.statusCode, "checkout").toBe(200);
    const checkoutBody = checkoutRes.json();

    const sessionId: string = checkoutBody.sessionId;
    expect(sessionId, "sessionId present").toBeTruthy();
    expect(checkoutBody.clientSecret, "clientSecret present").toBeTruthy();

    // Verify inventory was reserved
    const [invItem] = await db
      .select({ availabilityStatus: inventoryItems.availabilityStatus })
      .from(inventoryItems)
      .innerJoin(channelListings, eq(channelListings.inventoryItemId, inventoryItems.id))
      .where(eq(channelListings.id, listingId));

    expect(invItem?.availabilityStatus, "inventory reserved").toBe("reserved");

    // Verify checkout_session row exists before Stripe PaymentIntent is confirmed
    const { checkoutSessions } = await import("@bushpop/db/schema");
    const [session] = await db
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, sessionId));

    expect(session, "checkout session row exists").toBeTruthy();
    expect(session!.status, "session status is payment_pending").toBe("payment_pending");
    expect(session!.stripePaymentIntentId, "PI ID set").toBe("pi_smoke_test_mock");

    // ── Step 7: Simulate payment_intent.succeeded webhook ────────────────────
    const { handlePaymentIntentSucceededForTest } = await import(
      "../../../routes/v1/webhooks/stripe.js"
    );
    await handlePaymentIntentSucceededForTest("pi_smoke_test_mock");

    // ── Step 8: Verify order created, items sold, payout held, jobs set ───────
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.checkoutSessionId, sessionId));

    expect(order, "order created").toBeTruthy();
    expect(order!.status, "order status paid").toBe("paid");
    expect(order!.buyerId, "buyer ID on order").toBe(buyerId);
    expect(order!.sellerId, "seller ID on order").toBe(sellerId);
    expect(order!.subtotalCents, "subtotal").toBe(4500);
    // Contact email frozen at order creation, so a later change to user.email
    // cannot redirect or suppress this order's transactional mail.
    expect(order!.buyerEmailSnapshot, "buyer email snapshotted onto order").toBe(buyer.user.email);

    // Inventory items marked sold
    const [soldItem] = await db
      .select({ availabilityStatus: inventoryItems.availabilityStatus, lifecycleState: inventoryItems.lifecycleState })
      .from(inventoryItems)
      .innerJoin(channelListings, eq(channelListings.inventoryItemId, inventoryItems.id))
      .where(eq(channelListings.id, listingId));

    expect(soldItem?.availabilityStatus, "inventory availability sold").toBe("sold");
    expect(soldItem?.lifecycleState, "inventory lifecycle sold").toBe("sold");

    // Payout hold inserted
    const [hold] = await db
      .select()
      .from(payoutHolds)
      .where(eq(payoutHolds.orderId, order!.id));

    expect(hold, "payout hold created").toBeTruthy();
    expect(["held", "blocked"], "payout hold status").toContain(hold!.status);

    // jobs_enqueued_at set (idempotency guard)
    expect(order!.jobsEnqueuedAt, "jobs_enqueued_at set").toBeTruthy();

    // Cart items deleted after payment
    const [cart] = await db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.buyerId, buyerId));

    if (cart) {
      const remainingCartItems = await db
        .select()
        .from(cartItems)
        .where(eq(cartItems.cartId, cart.id));
      expect(remainingCartItems, "cart items deleted").toHaveLength(0);
    }
    // If cart row itself doesn't exist, that's fine too

    // ── Step 9: Seller marks order shipped ────────────────────────────────────
    const shipRes = await authedRequest(
      sellerToken,
      "PATCH",
      `/api/v1/seller/orders/${order!.id}/ship`,
      {
        trackingNumber: "AU9876543210",
        carrier: "Australia Post",
      },
    );
    expect(shipRes.statusCode, "mark shipped").toBe(200);
    const shipBody = shipRes.json();
    expect(shipBody.status, "order status after ship").toBe("shipped");
    expect(shipBody.trackingNumber, "tracking number set").toBe("AU9876543210");
    expect(shipBody.trackingCarrier, "carrier set").toBe("Australia Post");

    // ── Step 10: Simulate Starshipit tracking webhook (Delivered) ─────────────
    const { handleTrackingEventForTest } = await import(
      "../../../routes/v1/webhooks/starshipit.js"
    );
    await handleTrackingEventForTest({
      order_number: order!.id,
      tracking_number: "AU9876543210",
      status: "Delivered",
    });

    // ── Step 11: Verify order delivered ────────────────────────────────────────
    const [deliveredOrder] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, order!.id));

    expect(deliveredOrder?.status, "final order status delivered").toBe("delivered");
  });
});
