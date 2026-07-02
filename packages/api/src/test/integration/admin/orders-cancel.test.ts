import { describe, it, expect, beforeEach, vi } from "vitest";
import { ulid } from "ulid";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  carts,
  checkoutSessions,
  orders,
  payoutHolds,
  refunds,
  user,
  userRoles,
} from "@bushpop/db/schema";
import { signUpTestUser } from "../../helpers/auth.js";
import { authedRequest } from "../../helpers/http.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";

// AUDIT-009: Route-level test for admin cancel.
//
// The full happy/sad-path matrix lives in `refund-service.test.ts` because
// `processRefund` is the unit doing the real work. These tests only verify
// the HTTP wrapper: admin auth gate, request shape, and that the wrapper
// returns the canonical post-state.

vi.mock("../../../lib/stripe.js", () => {
  const stripe = {
    refunds: {
      create: vi.fn().mockResolvedValue({
        id: "re_admin_cancel_test",
        object: "refund",
        amount: 6000,
        status: "succeeded",
      }),
    },
    transfers: {
      createReversal: vi.fn(),
    },
  };
  return { getStripe: vi.fn(() => stripe), _mockStripe: stripe };
});

vi.mock("../../../workers/email.js", () => ({
  enqueueEmail: vi.fn().mockResolvedValue(undefined),
  startEmailWorker: vi.fn(),
  EMAIL_QUEUE: "email",
}));

beforeEach(() => {
  vi.clearAllMocks();
});

interface CancelFixture {
  orderId: string;
  sellerId: string;
  buyerSession: string;
  adminSession: string;
}

async function setupCancelFixture(): Promise<CancelFixture> {
  const channel = await getBushpopChannel();

  // Buyer
  const buyer = await signUpTestUser();
  // Admin (separate signup, then granted admin role)
  const admin = await signUpTestUser();
  await db.insert(userRoles).values({ userId: admin.user.id, role: "admin" });

  // Seller (DB-only — no signup needed for this test)
  const sellerId = ulid();
  await db.insert(user).values({
    id: sellerId,
    name: "Test Seller",
    email: `seller-${sellerId.toLowerCase()}@example.com`,
    emailVerified: true,
  });

  const cartId = ulid();
  const csId = ulid();
  const orderId = ulid();
  const holdId = ulid();

  await db.insert(carts).values({
    id: cartId,
    buyerId: buyer.user.id,
    channelId: channel.id,
  });

  await db.insert(checkoutSessions).values({
    id: csId,
    cartId,
    buyerId: buyer.user.id,
    channelId: channel.id,
    status: "succeeded",
    subtotalCents: 5000,
    shippingCents: 1000,
    platformFeeCents: 500,
    sellerProceedsCents: 5500,
    totalCents: 6000,
    currency: "AUD",
  });

  await db.insert(orders).values({
    id: orderId,
    checkoutSessionId: csId,
    buyerId: buyer.user.id,
    sellerId,
    channelId: channel.id,
    status: "paid",
    subtotalCents: 5000,
    shippingCents: 1000,
    platformFeeCents: 500,
    sellerProceedsCents: 5500,
    totalCents: 6000,
    currency: "AUD",
    stripePaymentIntentId: "pi_admin_cancel_test",
  });

  await db.insert(payoutHolds).values({
    id: holdId,
    orderId,
    sellerStripeAccountId: "acct_test",
    amountCents: 5500,
    currency: "AUD",
    status: "held",
    version: 1,
  });

  return {
    orderId,
    sellerId,
    buyerSession: buyer.sessionToken,
    adminSession: admin.sessionToken,
  };
}

describe("POST /api/v1/admin/orders/:id/cancel", () => {
  it("returns 200 with cancelled status, refundId, and persists the cancellation", async () => {
    const { orderId, adminSession } = await setupCancelFixture();

    const res = await authedRequest(
      adminSession,
      "POST",
      `/api/v1/admin/orders/${orderId}/cancel`,
      { reason: "test admin cancel" },
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.orderId).toBe(orderId);
    expect(body.status).toBe("cancelled");
    expect(body.refundId).toBe("re_admin_cancel_test");

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("cancelled");

    const [refund] = await db.select().from(refunds).where(eq(refunds.orderId, orderId));
    expect(refund!.status).toBe("processed");
    expect(refund!.stripeRefundId).toBe("re_admin_cancel_test");
  });

  it("rejects non-admin callers with 403", async () => {
    const { orderId, buyerSession } = await setupCancelFixture();

    const res = await authedRequest(
      buyerSession,
      "POST",
      `/api/v1/admin/orders/${orderId}/cancel`,
      {},
    );

    expect(res.statusCode).toBe(403);

    // Order must be untouched
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("paid");
  });

  it("rejects unauthenticated callers with 401", async () => {
    const { orderId } = await setupCancelFixture();

    // Use authedRequest with a bogus token — middleware should reject
    const res = await authedRequest(
      "not-a-real-token",
      "POST",
      `/api/v1/admin/orders/${orderId}/cancel`,
      {},
    );

    expect(res.statusCode).toBe(401);
  });

  it("second cancel call returns 409 (existing refund guard)", async () => {
    const { orderId, adminSession } = await setupCancelFixture();

    const first = await authedRequest(
      adminSession,
      "POST",
      `/api/v1/admin/orders/${orderId}/cancel`,
      {},
    );
    expect(first.statusCode).toBe(200);

    const second = await authedRequest(
      adminSession,
      "POST",
      `/api/v1/admin/orders/${orderId}/cancel`,
      {},
    );
    expect(second.statusCode).toBe(409);
  });
});
