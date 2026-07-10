import { describe, it, expect } from "vitest";
import { ulid } from "ulid";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  carts,
  checkoutSessions,
  marketplaceEvents,
  orders,
  payoutHolds,
  user,
  userRoles,
} from "@bushpop/db/schema";
import { signUpTestUser } from "../../helpers/auth.js";
import { authedRequest } from "../../helpers/http.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";

// Route-level tests for the admin unfreeze route. The locking/CAS behaviour of
// `unfreezePayoutHold()` itself is covered in payout-hold-service.test.ts —
// these cover the HTTP wrapper: the admin auth gate, the frozen/status
// preconditions, and the audit event.

interface Fixture {
  holdId: string;
  orderId: string;
  buyerSession: string;
  adminSession: string;
}

async function setupFixture(
  opts: { frozen?: boolean; status?: string } = {},
): Promise<Fixture> {
  const { frozen = true, status = "held" } = opts;
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
    stripePaymentIntentId: `pi_unfreeze_${holdId}`,
  });

  await db.insert(payoutHolds).values({
    id: holdId,
    orderId,
    sellerStripeAccountId: "acct_test",
    amountCents: 5500,
    currency: "AUD",
    status,
    version: 1,
    frozenAt: frozen ? new Date() : null,
  });

  return { holdId, orderId, buyerSession: buyer.sessionToken, adminSession: admin.sessionToken };
}

describe("POST /api/v1/admin/payouts/:holdId/unfreeze", () => {
  it("clears frozen_at on a frozen, releasable hold and writes an audit event", async () => {
    const { holdId, orderId, adminSession } = await setupFixture();

    const res = await authedRequest(adminSession, "POST", `/api/v1/admin/payouts/${holdId}/unfreeze`, {
      reason: "refund finalisation crashed; hold stranded",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ id: holdId, orderId, frozen: false, unfrozen: true });

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.frozenAt).toBeNull();
    // Unfreezing must not move the hold's status — it does not release money.
    expect(hold!.status).toBe("held");

    const events = await db
      .select()
      .from(marketplaceEvents)
      .where(eq(marketplaceEvents.entityId, holdId));
    expect(events).toHaveLength(1);
    expect(events[0]!.eventName).toBe("payout.unfrozen");
    expect(events[0]!.actorId).not.toBeNull();
  });

  it("returns 409 when the hold is not frozen, and writes no audit event", async () => {
    const { holdId, adminSession } = await setupFixture({ frozen: false });

    const res = await authedRequest(adminSession, "POST", `/api/v1/admin/payouts/${holdId}/unfreeze`, {
      reason: "test",
    });

    expect(res.statusCode).toBe(409);

    const events = await db
      .select()
      .from(marketplaceEvents)
      .where(eq(marketplaceEvents.entityId, holdId));
    expect(events).toHaveLength(0);
  });

  it("returns 409 for a frozen hold in a non-releasable status (e.g. a lost dispute)", async () => {
    const { holdId, adminSession } = await setupFixture({ status: "refunded" });

    const res = await authedRequest(adminSession, "POST", `/api/v1/admin/payouts/${holdId}/unfreeze`, {
      reason: "test",
    });

    expect(res.statusCode).toBe(409);

    // The freeze must survive — this is the guard that stops a lost dispute
    // being unfrozen back into a releasable state.
    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.frozenAt).not.toBeNull();
  });

  it("returns 404 for an unknown hold id", async () => {
    const { adminSession } = await setupFixture();

    const res = await authedRequest(adminSession, "POST", `/api/v1/admin/payouts/${ulid()}/unfreeze`, {
      reason: "test",
    });

    expect(res.statusCode).toBe(404);
  });

  it("requires a reason", async () => {
    const { holdId, adminSession } = await setupFixture();

    const res = await authedRequest(adminSession, "POST", `/api/v1/admin/payouts/${holdId}/unfreeze`, {});

    expect(res.statusCode).toBe(400);

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.frozenAt).not.toBeNull();
  });

  it("rejects non-admin callers with 403 and leaves the hold frozen", async () => {
    const { holdId, buyerSession } = await setupFixture();

    const res = await authedRequest(buyerSession, "POST", `/api/v1/admin/payouts/${holdId}/unfreeze`, {
      reason: "test",
    });

    expect(res.statusCode).toBe(403);

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.frozenAt).not.toBeNull();
  });

  it("rejects unauthenticated callers with 401", async () => {
    const { holdId } = await setupFixture();

    const res = await authedRequest("not-a-real-token", "POST", `/api/v1/admin/payouts/${holdId}/unfreeze`, {
      reason: "test",
    });

    expect(res.statusCode).toBe(401);
  });
});
