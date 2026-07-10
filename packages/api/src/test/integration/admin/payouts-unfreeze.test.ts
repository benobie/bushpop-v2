import { describe, it, expect } from "vitest";
import { ulid } from "ulid";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  carts,
  checkoutSessions,
  marketplaceEvents,
  orders,
  paymentOperations,
  payoutHolds,
  user,
  userRoles,
} from "@bushpop/db/schema";
import { signUpTestUser } from "../../helpers/auth.js";
import { authedRequest } from "../../helpers/http.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";

// Route-level tests for the admin unfreeze route.
//
// The load-bearing property: clearing a freeze must be impossible unless we can
// PROVE no money has already left the platform for this order. Freezing never
// touches `status`, so a lost chargeback and a crashed refund both sit at
// `status: "held"` + `frozen_at` — status cannot tell them apart. `frozen_reason`
// (plus the payment-operations WAL) is what does.

interface Fixture {
  holdId: string;
  orderId: string;
  buyerSession: string;
  adminSession: string;
}

async function setupFixture(
  opts: {
    frozen?: boolean;
    status?: string;
    frozenReason?: string | null;
    refundOp?: { status: string; failureProvenance?: string | null };
  } = {},
): Promise<Fixture> {
  const { frozen = true, status = "held", frozenReason = "refund", refundOp } = opts;
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
    frozenReason: frozen ? frozenReason : null,
  });

  if (refundOp) {
    await db.insert(paymentOperations).values({
      id: ulid(),
      orderId,
      type: "refund",
      provider: "stripe",
      status: refundOp.status,
      failureProvenance: refundOp.failureProvenance ?? null,
    });
  }

  return { holdId, orderId, buyerSession: buyer.sessionToken, adminSession: admin.sessionToken };
}

async function unfreeze(session: string, holdId: string, reason = "operator reconciliation") {
  return authedRequest(session, "POST", `/api/v1/admin/payouts/${holdId}/unfreeze`, { reason });
}

async function auditEvents(holdId: string) {
  return db.select().from(marketplaceEvents).where(eq(marketplaceEvents.entityId, holdId));
}

describe("POST /api/v1/admin/payouts/:holdId/unfreeze", () => {
  it("clears the freeze when a refund provably never reached Stripe", async () => {
    // The one legitimate case: the refund op failed outright, money never moved.
    const { holdId, orderId, adminSession } = await setupFixture({
      frozenReason: "refund",
      refundOp: { status: "failed", failureProvenance: "stripe_declined" },
    });

    const res = await unfreeze(adminSession, holdId);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: holdId, orderId, frozen: false, unfrozen: true });

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.frozenAt).toBeNull();
    expect(hold!.frozenReason).toBeNull();
    // Unfreezing must not move the hold's status — it releases no money.
    expect(hold!.status).toBe("held");

    const events = await auditEvents(holdId);
    expect(events).toHaveLength(1);
    expect(events[0]!.eventName).toBe("payout.unfrozen");
  });

  // ── Regression test for the defect this route originally shipped with ──
  //
  // A LOST chargeback leaves the hold at status "held" + frozen: `freezePayoutHold`
  // never touches status, and `charge.dispute.closed` with `lost` does nothing to
  // the hold. An earlier version of this route allowed exactly that shape through,
  // letting an operator unfreeze and then release a payout for money the buyer had
  // already clawed back.
  it("REFUSES a hold frozen by a dispute, even though its status is the releasable 'held'", async () => {
    const { holdId, adminSession } = await setupFixture({
      status: "held",
      frozenReason: "dispute",
    });

    const res = await unfreeze(adminSession, holdId);

    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/chargeback/i);

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.frozenAt).not.toBeNull();
    expect(hold!.frozenReason).toBe("dispute");
    expect(await auditEvents(holdId)).toHaveLength(0);
  });

  it("REFUSES a refund-frozen hold whose refund succeeded at Stripe", async () => {
    const { holdId, adminSession } = await setupFixture({
      frozenReason: "refund",
      refundOp: { status: "succeeded" },
    });

    const res = await unfreeze(adminSession, holdId);

    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/reached Stripe/i);

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.frozenAt).not.toBeNull();
  });

  it("REFUSES a refund-frozen hold whose refund outcome is indeterminate", async () => {
    // Stripe 5xx'd after accepting the call — the money may or may not have moved.
    const { holdId, adminSession } = await setupFixture({
      frozenReason: "refund",
      refundOp: { status: "indeterminate_5xx" },
    });

    expect((await unfreeze(adminSession, holdId)).statusCode).toBe(409);

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.frozenAt).not.toBeNull();
  });

  it("REFUSES a refund-frozen hold auto-failed without verification", async () => {
    const { holdId, adminSession } = await setupFixture({
      frozenReason: "refund",
      refundOp: { status: "failed", failureProvenance: "auto_timeout_unverified" },
    });

    expect((await unfreeze(adminSession, holdId)).statusCode).toBe(409);
  });

  it("REFUSES a hold whose freeze has no recorded provenance (fails closed)", async () => {
    const { holdId, adminSession } = await setupFixture({ frozenReason: null });

    const res = await unfreeze(adminSession, holdId);

    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/no recorded reason/i);

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.frozenAt).not.toBeNull();
  });

  it("returns 409 when the hold is not frozen, and writes no audit event", async () => {
    const { holdId, adminSession } = await setupFixture({ frozen: false });

    expect((await unfreeze(adminSession, holdId)).statusCode).toBe(409);
    expect(await auditEvents(holdId)).toHaveLength(0);
  });

  it("returns 409 for a frozen hold in a terminal status", async () => {
    const { holdId, adminSession } = await setupFixture({ status: "refunded" });

    expect((await unfreeze(adminSession, holdId)).statusCode).toBe(409);

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.frozenAt).not.toBeNull();
  });

  it("returns 404 for an unknown hold id", async () => {
    const { adminSession } = await setupFixture();
    expect((await unfreeze(adminSession, ulid())).statusCode).toBe(404);
  });

  it("requires a reason", async () => {
    const { holdId, adminSession } = await setupFixture();

    const res = await authedRequest(
      adminSession,
      "POST",
      `/api/v1/admin/payouts/${holdId}/unfreeze`,
      {},
    );

    expect(res.statusCode).toBe(400);

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.frozenAt).not.toBeNull();
  });

  it("rejects non-admin callers with 403 and leaves the hold frozen", async () => {
    const { holdId, buyerSession } = await setupFixture();

    expect((await unfreeze(buyerSession, holdId)).statusCode).toBe(403);

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.frozenAt).not.toBeNull();
  });

  it("rejects unauthenticated callers with 401", async () => {
    const { holdId } = await setupFixture();
    expect((await unfreeze("not-a-real-token", holdId)).statusCode).toBe(401);
  });
});

describe("freezePayoutHold provenance", () => {
  it("escalates an existing refund freeze to dispute (the stronger reason wins)", async () => {
    const { holdId, orderId } = await setupFixture({ frozenReason: "refund" });

    const { freezePayoutHold } = await import("../../../lib/payout-hold-service.js");
    await freezePayoutHold(orderId, "dispute");

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.frozenReason).toBe("dispute");
    expect(hold!.frozenAt).not.toBeNull();
  });

  it("does NOT downgrade an existing dispute freeze to refund", async () => {
    const { holdId, orderId } = await setupFixture({ frozenReason: "dispute" });

    const { freezePayoutHold } = await import("../../../lib/payout-hold-service.js");
    await freezePayoutHold(orderId, "refund");

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.frozenReason).toBe("dispute");
  });
});
