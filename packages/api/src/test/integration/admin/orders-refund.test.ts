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
  marketplaceEvents,
  user,
  userRoles,
} from "@bushpop/db/schema";
import { signUpTestUser } from "../../helpers/auth.js";
import { authedRequest } from "../../helpers/http.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";

// B3: route-level test for the admin refund action (runbook T-0 step 3
// depends on this path). Mirrors orders-cancel.test.ts's structure — the
// refund state-machine matrix itself lives in refund-service.test.ts.

vi.mock("../../../lib/stripe.js", () => {
  const stripe = {
    refunds: {
      create: vi.fn().mockResolvedValue({
        id: "re_admin_refund_test",
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

interface RefundFixture {
  orderId: string;
  sellerId: string;
  buyerSession: string;
  adminSession: string;
}

async function setupRefundFixture(): Promise<RefundFixture> {
  const channel = await getBushpopChannel();

  const buyer = await signUpTestUser();
  const admin = await signUpTestUser();
  await db.insert(userRoles).values({ userId: admin.user.id, role: "admin" });

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

  await db.insert(carts).values({ id: cartId, buyerId: buyer.user.id, channelId: channel.id });

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
    stripePaymentIntentId: "pi_admin_refund_test",
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

describe("POST /api/v1/admin/orders/:id/refund", () => {
  it("returns 200 with refunded status, refundId, and persists the refund", async () => {
    const { orderId, adminSession } = await setupRefundFixture();

    const res = await authedRequest(
      adminSession,
      "POST",
      `/api/v1/admin/orders/${orderId}/refund`,
      { reason: "test admin refund" },
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.orderId).toBe(orderId);
    expect(body.status).toBe("refunded");
    expect(body.refundId).toBe("re_admin_refund_test");

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("refunded");

    const [refund] = await db.select().from(refunds).where(eq(refunds.orderId, orderId));
    expect(refund!.status).toBe("processed");
    expect(refund!.stripeRefundId).toBe("re_admin_refund_test");
  });

  it("writes an append-only marketplace_events audit row for the refund", async () => {
    const { orderId, adminSession } = await setupRefundFixture();

    await authedRequest(adminSession, "POST", `/api/v1/admin/orders/${orderId}/refund`, {
      reason: "test admin refund",
    });

    // dispatchEvent() is fire-and-forget from the route (never blocks the
    // refund response) — poll briefly for the audit row to land rather than
    // asserting immediately.
    let refundEvent: (typeof marketplaceEvents.$inferSelect) | undefined;
    for (let attempt = 0; attempt < 20 && !refundEvent; attempt++) {
      const events = await db
        .select()
        .from(marketplaceEvents)
        .where(eq(marketplaceEvents.entityId, orderId));
      refundEvent = events.find((e) => e.eventName === "order.refunded");
      if (!refundEvent) await new Promise((r) => setTimeout(r, 50));
    }
    expect(refundEvent).toBeDefined();
    expect(refundEvent!.category).toBe("order");
    expect(refundEvent!.entityType).toBe("order");
    expect((refundEvent!.metadata as Record<string, unknown>)?.refundedBy).toBe("admin");
    expect((refundEvent!.metadata as Record<string, unknown>)?.reason).toBe("test admin refund");
  });

  it("rejects non-admin callers with 403 and leaves the order untouched", async () => {
    const { orderId, buyerSession } = await setupRefundFixture();

    const res = await authedRequest(
      buyerSession,
      "POST",
      `/api/v1/admin/orders/${orderId}/refund`,
      {},
    );

    expect(res.statusCode).toBe(403);

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("paid");
  });

  it("rejects unauthenticated callers with 401", async () => {
    const { orderId } = await setupRefundFixture();

    const res = await authedRequest(
      "not-a-real-token",
      "POST",
      `/api/v1/admin/orders/${orderId}/refund`,
      {},
    );

    expect(res.statusCode).toBe(401);
  });

  it("second refund call returns 409 (existing refund guard)", async () => {
    const { orderId, adminSession } = await setupRefundFixture();

    const first = await authedRequest(
      adminSession,
      "POST",
      `/api/v1/admin/orders/${orderId}/refund`,
      {},
    );
    expect(first.statusCode).toBe(200);

    const second = await authedRequest(
      adminSession,
      "POST",
      `/api/v1/admin/orders/${orderId}/refund`,
      {},
    );
    expect(second.statusCode).toBe(409);
  });
});
