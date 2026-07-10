import { describe, it, expect } from "vitest";
import { ulid } from "ulid";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  carts,
  checkoutSessions,
  marketplaceEvents,
  orders,
  pickupCodes,
  user,
  userRoles,
} from "@bushpop/db/schema";
import { signUpTestUser } from "../../helpers/auth.js";
import { authedRequest } from "../../helpers/http.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";
import { MAX_PICKUP_CODE_ATTEMPTS } from "../../../lib/pickup-code-service.js";

interface Fixture {
  orderId: string;
  buyerSession: string;
  adminSession: string;
}

async function setupFixture(
  opts: { attempts?: number; redeemed?: boolean; withPickupCode?: boolean } = {},
): Promise<Fixture> {
  const { attempts = MAX_PICKUP_CODE_ATTEMPTS, redeemed = false, withPickupCode = true } = opts;
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

  await db.insert(carts).values({ id: cartId, buyerId: buyer.user.id, channelId: channel.id });

  await db.insert(checkoutSessions).values({
    id: csId,
    cartId,
    buyerId: buyer.user.id,
    channelId: channel.id,
    status: "succeeded",
    subtotalCents: 5000,
    shippingCents: 0,
    platformFeeCents: 500,
    sellerProceedsCents: 4500,
    totalCents: 5000,
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
    shippingCents: 0,
    platformFeeCents: 500,
    sellerProceedsCents: 4500,
    totalCents: 5000,
    currency: "AUD",
    stripePaymentIntentId: `pi_pickup_${orderId}`,
  });

  if (withPickupCode) {
    await db.insert(pickupCodes).values({
      id: ulid(),
      orderId,
      salt: "0123456789abcdef0123456789abcdef",
      attempts,
      redeemedAt: redeemed ? new Date() : null,
    });
  }

  return { orderId, buyerSession: buyer.sessionToken, adminSession: admin.sessionToken };
}

describe("POST /api/v1/admin/orders/:id/reset-pickup-attempts", () => {
  it("resets a locked-out attempts counter and writes an audit event", async () => {
    const { orderId, adminSession } = await setupFixture();

    const res = await authedRequest(
      adminSession,
      "POST",
      `/api/v1/admin/orders/${orderId}/reset-pickup-attempts`,
      { reason: "buyer jammed the counter after collecting" },
    );

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ orderId, attempts: 0, maxAttempts: MAX_PICKUP_CODE_ATTEMPTS });

    const [pickup] = await db.select().from(pickupCodes).where(eq(pickupCodes.orderId, orderId));
    expect(pickup!.attempts).toBe(0);
    // The salt must not rotate — the buyer's already-issued code stays valid.
    expect(pickup!.salt).toBe("0123456789abcdef0123456789abcdef");

    const events = await db
      .select()
      .from(marketplaceEvents)
      .where(eq(marketplaceEvents.entityId, orderId));
    expect(events).toHaveLength(1);
    expect(events[0]!.eventName).toBe("pickup.attempts_reset");
    expect(events[0]!.metadata).toMatchObject({ previousAttempts: MAX_PICKUP_CODE_ATTEMPTS });
  });

  it("returns 409 for an already-redeemed pickup code", async () => {
    const { orderId, adminSession } = await setupFixture({ attempts: 2, redeemed: true });

    const res = await authedRequest(
      adminSession,
      "POST",
      `/api/v1/admin/orders/${orderId}/reset-pickup-attempts`,
      { reason: "test" },
    );

    expect(res.statusCode).toBe(409);

    const [pickup] = await db.select().from(pickupCodes).where(eq(pickupCodes.orderId, orderId));
    expect(pickup!.attempts).toBe(2);
  });

  it("returns 404 when the order has no pickup code", async () => {
    const { orderId, adminSession } = await setupFixture({ withPickupCode: false });

    const res = await authedRequest(
      adminSession,
      "POST",
      `/api/v1/admin/orders/${orderId}/reset-pickup-attempts`,
      { reason: "test" },
    );

    expect(res.statusCode).toBe(404);
  });

  it("requires a reason", async () => {
    const { orderId, adminSession } = await setupFixture();

    const res = await authedRequest(
      adminSession,
      "POST",
      `/api/v1/admin/orders/${orderId}/reset-pickup-attempts`,
      {},
    );

    expect(res.statusCode).toBe(400);
  });

  it("rejects non-admin callers with 403 and leaves the lockout in place", async () => {
    const { orderId, buyerSession } = await setupFixture();

    const res = await authedRequest(
      buyerSession,
      "POST",
      `/api/v1/admin/orders/${orderId}/reset-pickup-attempts`,
      { reason: "test" },
    );

    expect(res.statusCode).toBe(403);

    const [pickup] = await db.select().from(pickupCodes).where(eq(pickupCodes.orderId, orderId));
    expect(pickup!.attempts).toBe(MAX_PICKUP_CODE_ATTEMPTS);
  });

  it("rejects unauthenticated callers with 401", async () => {
    const { orderId } = await setupFixture();

    const res = await authedRequest(
      "not-a-real-token",
      "POST",
      `/api/v1/admin/orders/${orderId}/reset-pickup-attempts`,
      { reason: "test" },
    );

    expect(res.statusCode).toBe(401);
  });
});
