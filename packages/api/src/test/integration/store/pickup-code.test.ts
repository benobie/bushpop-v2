import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  carts,
  checkoutSessions,
  orders,
  payoutHolds,
  marketplaceEvents,
  channelListings,
} from "@bushpop/db/schema";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { authedRequest, getTestApp } from "../../helpers/http.js";
import { createStripeReadySeller } from "../../helpers/stripe-mock.js";
import { MAX_PICKUP_CODE_ATTEMPTS } from "../../../lib/pickup-code-service.js";

// ── Mock Stripe (release path calls transfers.create) ──────────────────────
vi.mock("../../../lib/stripe.js", () => {
  const mockTransfer = { id: "tr_test_pickup_mock", amount: 4600, currency: "aud" };
  const stripe = {
    transfers: {
      create: vi.fn().mockResolvedValue(mockTransfer),
      createReversal: vi.fn(),
      list: vi.fn().mockResolvedValue({ data: [], has_more: false }),
    },
    refunds: { create: vi.fn() },
    balance: {
      retrieve: vi.fn().mockResolvedValue({ available: [], pending: [] }),
    },
  };
  return { getStripe: vi.fn(() => stripe), _resetStripe: vi.fn(), _mockStripe: stripe };
});

vi.mock("../../../workers/checkout-expiry.js", () => ({
  scheduleCheckoutExpiry: vi.fn().mockResolvedValue(undefined),
  startCheckoutExpiryWorker: vi.fn(),
  CHECKOUT_EXPIRY_QUEUE: "checkout-expiry",
}));

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

async function setupSellerWithStripe(sellerId: string) {
  await createStripeReadySeller(sellerId);
}

/** Insert a paid pickup order (no shipping address snapshot) directly, bypassing checkout. */
async function insertPaidPickupOrder(opts: {
  buyerId: string;
  sellerId: string;
  channelId: string;
}) {
  const [cart] = await db
    .insert(carts)
    .values({ buyerId: opts.buyerId, channelId: opts.channelId })
    .onConflictDoUpdate({
      target: [carts.buyerId, carts.channelId],
      set: { updatedAt: new Date() },
    })
    .returning();

  const [checkoutSession] = await db
    .insert(checkoutSessions)
    .values({
      cartId: cart!.id,
      buyerId: opts.buyerId,
      channelId: opts.channelId,
      status: "succeeded",
      subtotalCents: 5000,
      shippingCents: 0,
      platformFeeCents: 400,
      sellerProceedsCents: 4600,
      totalCents: 5000,
      currency: "AUD",
      // No shippingAddressId — this is the pickup case.
    })
    .returning();

  const [order] = await db
    .insert(orders)
    .values({
      checkoutSessionId: checkoutSession!.id,
      buyerId: opts.buyerId,
      sellerId: opts.sellerId,
      channelId: opts.channelId,
      status: "paid",
      subtotalCents: 5000,
      shippingCents: 0,
      platformFeeCents: 400,
      buyerProtectionFeeCents: 0,
      sellerProceedsCents: 4600,
      totalCents: 5000,
      currency: "AUD",
      shippingAddressSnapshot: null,
      stripePaymentIntentId: "pi_test_mock_pickup",
    })
    .returning();

  return order!;
}

describe("Pickup collection codes", () => {
  let sellerToken: string;
  let sellerId: string;
  let buyerToken: string;
  let buyerId: string;
  let channelId: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    const seller = await signUpTestUser();
    sellerId = seller.user.id;
    sellerToken = seller.sessionToken;
    await grantSellerRole(sellerId, { withDefaultAddress: true });
    await setupSellerWithStripe(sellerId);

    const buyer = await signUpTestUser();
    buyerId = buyer.user.id;
    buyerToken = buyer.sessionToken;

    // Only used to obtain a real channelId + satisfy the orders FK — the
    // listing itself isn't purchased through checkout here.
    const listing = await createActiveTestListing(sellerId, { priceCents: 5000 });
    const [listingRow] = await db
      .select({ channelId: channelListings.channelId })
      .from(channelListings)
      .where(eq(channelListings.id, listing.id));
    channelId = listingRow!.channelId;
  });

  async function makePickupOrder() {
    return insertPaidPickupOrder({ buyerId, sellerId, channelId });
  }

  it("buyer can issue and re-fetch the same 6-digit code", async () => {
    const order = await makePickupOrder();

    const res1 = await authedRequest(
      buyerToken,
      "GET",
      `/api/v1/store/orders/${order.id}/pickup-code`,
    );
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json();
    expect(body1.code).toMatch(/^\d{6}$/);

    const res2 = await authedRequest(
      buyerToken,
      "GET",
      `/api/v1/store/orders/${order.id}/pickup-code`,
    );
    expect(res2.statusCode).toBe(200);
    expect(res2.json().code).toBe(body1.code);
  });

  it("returns 401 when unauthenticated", async () => {
    const order = await makePickupOrder();
    const app = await getTestApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/store/orders/${order.id}/pickup-code`,
      headers: { "x-channel": "bushpop" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for another buyer's order", async () => {
    const order = await makePickupOrder();
    const otherBuyer = await signUpTestUser();
    const res = await authedRequest(
      otherBuyer.sessionToken,
      "GET",
      `/api/v1/store/orders/${order.id}/pickup-code`,
    );
    expect(res.statusCode).toBe(404);
  });

  it("seller confirms with the correct code: order completes and payout releases instantly", async () => {
    const order = await makePickupOrder();
    const [hold] = await db
      .insert(payoutHolds)
      .values({
        orderId: order.id,
        sellerStripeAccountId: "acct_test_seller",
        amountCents: 4600,
        currency: "AUD",
        status: "held",
      })
      .returning();

    const codeRes = await authedRequest(
      buyerToken,
      "GET",
      `/api/v1/store/orders/${order.id}/pickup-code`,
    );
    const code = codeRes.json().code as string;

    const { getStripe } = await import("../../../lib/stripe.js");
    const stripe = getStripe() as unknown as {
      transfers: { create: ReturnType<typeof vi.fn> };
    };

    const confirmRes = await authedRequest(
      sellerToken,
      "PATCH",
      `/api/v1/seller/orders/${order.id}/confirm-pickup`,
      { code },
    );
    expect(confirmRes.statusCode).toBe(200);
    expect(confirmRes.json().status).toBe("completed");

    const [updatedOrder] = await db
      .select({ status: orders.status, deliveryConfirmedAt: orders.deliveryConfirmedAt })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(updatedOrder?.status).toBe("completed");
    expect(updatedOrder?.deliveryConfirmedAt).not.toBeNull();

    const [updatedHold] = await db
      .select({ status: payoutHolds.status, buyerConfirmedAt: payoutHolds.buyerConfirmedAt })
      .from(payoutHolds)
      .where(eq(payoutHolds.id, hold!.id));
    expect(updatedHold?.status).toBe("released");
    expect(updatedHold?.buyerConfirmedAt).not.toBeNull();

    expect(stripe.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({ transfer_group: order.id }),
      expect.anything(),
    );

    const [event] = await db
      .select()
      .from(marketplaceEvents)
      .where(eq(marketplaceEvents.entityId, order.id));
    expect(event?.eventName).toBe("order.pickup_code_redeemed");
  });

  it("rejects an incorrect code and increments attempts without changing order status", async () => {
    const order = await makePickupOrder();

    const res = await authedRequest(
      sellerToken,
      "PATCH",
      `/api/v1/seller/orders/${order.id}/confirm-pickup`,
      { code: "000000" },
    );
    expect(res.statusCode).toBe(409);

    const [updatedOrder] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(updatedOrder?.status).toBe("paid");
  });

  it("locks out after too many incorrect attempts", async () => {
    const order = await makePickupOrder();

    for (let i = 0; i < MAX_PICKUP_CODE_ATTEMPTS; i++) {
      const res = await authedRequest(
        sellerToken,
        "PATCH",
        `/api/v1/seller/orders/${order.id}/confirm-pickup`,
        { code: "000000" },
      );
      expect(res.statusCode).toBe(409);
    }

    const codeRes = await authedRequest(
      buyerToken,
      "GET",
      `/api/v1/store/orders/${order.id}/pickup-code`,
    );
    const code = codeRes.json().code as string;

    // Even the CORRECT code is now rejected — locked out.
    const finalRes = await authedRequest(
      sellerToken,
      "PATCH",
      `/api/v1/seller/orders/${order.id}/confirm-pickup`,
      { code },
    );
    expect(finalRes.statusCode).toBe(409);
  });

  it("returns 409 when confirming an already-collected order", async () => {
    const order = await makePickupOrder();
    const codeRes = await authedRequest(
      buyerToken,
      "GET",
      `/api/v1/store/orders/${order.id}/pickup-code`,
    );
    const code = codeRes.json().code as string;

    const first = await authedRequest(
      sellerToken,
      "PATCH",
      `/api/v1/seller/orders/${order.id}/confirm-pickup`,
      { code },
    );
    expect(first.statusCode).toBe(200);

    const second = await authedRequest(
      sellerToken,
      "PATCH",
      `/api/v1/seller/orders/${order.id}/confirm-pickup`,
      { code },
    );
    expect(second.statusCode).toBe(409);
  });
});
