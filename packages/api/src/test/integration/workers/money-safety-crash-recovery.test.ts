/**
 * Money-safety crash-recovery integration suite.
 *
 * Covers:
 *  - AUDIT-003: succeeded-session + no-order recovery + concurrency (one order).
 *  - AUDIT-010: re-runnable job enqueue on existing order with null guard +
 *    order-jobs sweeper.
 *  - Payout-release shared core / worker branches: happy release (both
 *    transfer-id columns), 5xx → release_failed_retryable, List-first adopt
 *    (no double-create), reserve gate skip, non-transferable → blocked,
 *    attempt-cap → release_failed_manual + alert.
 *  - admin-alerts: email sender called; send-failure does not throw.
 *
 * Stripe is mocked (vi.mock) — no real API calls, sk_test only.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ulid } from "ulid";
import { eq, and } from "drizzle-orm";
import { db, pgClient } from "@bushpop/db/client";
import {
  user,
  carts,
  cartItems,
  checkoutSessions,
  orders,
  orderItems,
  payoutHolds,
  paymentOperations,
  sellerProfiles,
  inventoryItems,
  channelListings,
  categories,
} from "@bushpop/db/schema";
import { getPikloChannel } from "../../helpers/get-channel.js";

// ── Stripe mock ──────────────────────────────────────────────────────────────
// A controllable mock so individual tests can stub transfers.create /
// transfers.list / balance.retrieve behaviour.

const stripeMock = {
  transfers: {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue({ data: [] }),
  },
  balance: {
    retrieve: vi.fn().mockResolvedValue({
      available: [{ currency: "aud", amount: 100_000_00 }],
      pending: [],
    }),
  },
};

vi.mock("../../../lib/stripe.js", () => ({
  getStripe: vi.fn(() => stripeMock),
  _resetStripe: vi.fn(),
}));

// Mock the job-enqueue side effects so AUDIT-010 paths don't need real BullMQ.
const enqueueEmailMock = vi.fn().mockResolvedValue(undefined);
const enqueueShippingLabelMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../workers/email.js", () => ({
  enqueueEmail: (...args: unknown[]) => enqueueEmailMock(...args),
  startEmailWorker: vi.fn(),
  EMAIL_QUEUE: "email",
}));
vi.mock("../../../workers/shipping-label.js", () => ({
  enqueueShippingLabel: (...args: unknown[]) => enqueueShippingLabelMock(...args),
  startShippingLabelWorker: vi.fn(),
  SHIPPING_LABEL_QUEUE: "shipping-label",
}));

// ── Imports after mocks ──────────────────────────────────────────────────────

import { handlePaymentIntentSucceededForTest } from "../../../routes/v1/webhooks/stripe.js";
import { releasePayoutHold, freezePayoutHold } from "../../../lib/payout-hold-service.js";
import * as paymentOps from "../../../lib/payment-operations.js";
import { runOrderJobsSweep } from "../../../workers/order-jobs-sweeper.js";
import { runPayoutReleaseSweep } from "../../../workers/payout-release.js";
import { enqueueAdminAlert } from "../../../lib/admin-alerts.js";
import {
  getEmailSender,
  _resetEmailSender,
  clearMockEmails,
  getSentEmails,
  setMockEmailError,
} from "../../../lib/email/index.js";

// ── Fixture helpers ──────────────────────────────────────────────────────────

interface Fixture {
  buyerId: string;
  sellerId: string;
  cartId: string;
  sessionId: string;
  channelId: string;
  inventoryItemId: string;
  channelListingId: string;
}

async function getCategoryId(): Promise<string> {
  const [cat] = await db.select({ id: categories.id }).from(categories).limit(1);
  if (cat) return cat.id;
  const [created] = await db
    .insert(categories)
    .values({ name: "Test", slug: `test-${ulid().toLowerCase()}` })
    .returning({ id: categories.id });
  return created!.id;
}

/**
 * Build a `succeeded` checkout session with intact cart_items + a Stripe-ready
 * seller, but NO order yet — the AUDIT-003 recovery precondition.
 */
async function makeRecoveryFixture(opts?: {
  stripeReady?: boolean;
}): Promise<Fixture> {
  const channel = await getPikloChannel();
  const buyerId = ulid();
  const sellerId = ulid();
  const cartId = ulid();
  const sessionId = ulid();
  const categoryId = await getCategoryId();
  const stripeReady = opts?.stripeReady ?? true;

  await db.insert(user).values([
    { id: buyerId, name: "Buyer", email: `buyer-${buyerId.toLowerCase()}@e.com`, emailVerified: true },
    { id: sellerId, name: "Seller", email: `seller-${sellerId.toLowerCase()}@e.com`, emailVerified: true },
  ]);

  await db.insert(sellerProfiles).values({
    userId: sellerId,
    storeName: "Test Store",
    handle: `store-${sellerId.toLowerCase()}`,
    stripeAccountId: stripeReady ? `acct_${sellerId.toLowerCase()}` : null,
    stripeChargesEnabled: stripeReady,
    stripePayoutsEnabled: stripeReady,
    stripeOnboardingStatus: stripeReady ? "complete" : "pending",
  });

  const invId = ulid();
  await db.insert(inventoryItems).values({
    id: invId,
    ownerId: sellerId,
    categoryId,
    title: "Item",
    availabilityStatus: "reserved",
    lifecycleState: "owned",
  });

  const clId = ulid();
  await db.insert(channelListings).values({
    id: clId,
    inventoryItemId: invId,
    channelId: channel.id,
    title: "Item",
    handle: `item-${clId.toLowerCase()}`,
    status: "reserved",
    priceCents: 5000,
    currency: "AUD",
  });

  await db.insert(carts).values({ id: cartId, buyerId, channelId: channel.id });
  await db.insert(cartItems).values({
    cartId,
    channelListingId: clId,
    priceCents: 5000,
    currency: "AUD",
  });

  await db.insert(checkoutSessions).values({
    id: sessionId,
    cartId,
    buyerId,
    channelId: channel.id,
    status: "succeeded",
    subtotalCents: 5000,
    shippingCents: 1000,
    platformFeeCents: 500,
    sellerProceedsCents: 5500,
    totalCents: 6000,
    currency: "AUD",
    stripePaymentIntentId: `pi_${sessionId.toLowerCase()}`,
  });

  return {
    buyerId,
    sellerId,
    cartId,
    sessionId,
    channelId: channel.id,
    inventoryItemId: invId,
    channelListingId: clId,
  };
}

/** Insert an order + held payout hold for a fixture (post-recovery state). */
async function makeOrderWithHeldHold(
  f: Fixture,
  holdOverrides: Partial<typeof payoutHolds.$inferInsert> = {},
): Promise<{ orderId: string; holdId: string }> {
  const orderId = ulid();
  await db.insert(orders).values({
    id: orderId,
    checkoutSessionId: f.sessionId,
    buyerId: f.buyerId,
    sellerId: f.sellerId,
    channelId: f.channelId,
    status: "delivered",
    subtotalCents: 5000,
    shippingCents: 1000,
    platformFeeCents: 500,
    sellerProceedsCents: 5500,
    totalCents: 6000,
    currency: "AUD",
    stripePaymentIntentId: `pi_${f.sessionId.toLowerCase()}`,
    deliveryConfirmedAt: new Date(Date.now() - 30 * 24 * 3600_000),
  });

  const [hold] = await db
    .insert(payoutHolds)
    .values({
      orderId,
      sellerStripeAccountId: `acct_${f.sellerId.toLowerCase()}`,
      amountCents: 5500,
      currency: "AUD",
      status: "held",
      deliveryConfirmedAt: new Date(Date.now() - 30 * 24 * 3600_000),
      ...holdOverrides,
    })
    .returning({ id: payoutHolds.id });

  return { orderId, holdId: hold!.id };
}

beforeEach(() => {
  vi.clearAllMocks();
  stripeMock.transfers.create.mockReset();
  stripeMock.transfers.list.mockReset().mockResolvedValue({ data: [] });
  stripeMock.balance.retrieve.mockReset().mockResolvedValue({
    available: [{ currency: "aud", amount: 100_000_00 }],
    pending: [],
  });
  _resetEmailSender();
  clearMockEmails();
});

// ── AUDIT-003 ─────────────────────────────────────────────────────────────────

describe("AUDIT-003 — succeeded + no-order recovery", () => {
  it("recreates the order + hold + items when session succeeded but order missing", async () => {
    const f = await makeRecoveryFixture();

    await handlePaymentIntentSucceededForTest(`pi_${f.sessionId.toLowerCase()}`);

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.checkoutSessionId, f.sessionId));
    expect(order).toBeDefined();
    expect(order!.status).toBe("paid");

    const [hold] = await db
      .select()
      .from(payoutHolds)
      .where(eq(payoutHolds.orderId, order!.id));
    expect(hold).toBeDefined();
    expect(hold!.status).toBe("held");

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order!.id));
    expect(items.length).toBe(1);

    // cart_items consumed by the winner.
    const remainingCart = await db
      .select()
      .from(cartItems)
      .where(eq(cartItems.cartId, f.cartId));
    expect(remainingCart.length).toBe(0);
  });

  it("creates exactly ONE order + ONE hold under concurrent recovery", async () => {
    const f = await makeRecoveryFixture();
    const pi = `pi_${f.sessionId.toLowerCase()}`;

    await Promise.all([
      handlePaymentIntentSucceededForTest(pi),
      handlePaymentIntentSucceededForTest(pi),
      handlePaymentIntentSucceededForTest(pi),
    ]);

    const allOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.checkoutSessionId, f.sessionId));
    expect(allOrders.length).toBe(1);

    const allHolds = await db
      .select()
      .from(payoutHolds)
      .where(eq(payoutHolds.orderId, allOrders[0]!.id));
    expect(allHolds.length).toBe(1);
  });

  it("is idempotent — a second delivery after recovery does not double anything", async () => {
    const f = await makeRecoveryFixture();
    const pi = `pi_${f.sessionId.toLowerCase()}`;

    await handlePaymentIntentSucceededForTest(pi);
    await handlePaymentIntentSucceededForTest(pi);

    const allOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.checkoutSessionId, f.sessionId));
    expect(allOrders.length).toBe(1);
  });
});

// ── AUDIT-010 ─────────────────────────────────────────────────────────────────

describe("AUDIT-010 — re-runnable job enqueue", () => {
  it("re-enqueues jobs when order exists with jobs_enqueued_at null", async () => {
    const f = await makeRecoveryFixture();
    // Create the order with null jobs guard.
    const { orderId } = await makeOrderWithHeldHold(f);
    await db.update(orders).set({ jobsEnqueuedAt: null }).where(eq(orders.id, orderId));

    await handlePaymentIntentSucceededForTest(`pi_${f.sessionId.toLowerCase()}`);

    // Both emails + shipping label enqueued.
    expect(enqueueEmailMock).toHaveBeenCalledTimes(2);
    expect(enqueueShippingLabelMock).toHaveBeenCalledTimes(1);

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.jobsEnqueuedAt).not.toBeNull();
  });

  it("does NOT re-enqueue when jobs_enqueued_at already set", async () => {
    const f = await makeRecoveryFixture();
    const { orderId } = await makeOrderWithHeldHold(f);
    await db.update(orders).set({ jobsEnqueuedAt: new Date() }).where(eq(orders.id, orderId));

    await handlePaymentIntentSucceededForTest(`pi_${f.sessionId.toLowerCase()}`);

    expect(enqueueEmailMock).not.toHaveBeenCalled();
    expect(enqueueShippingLabelMock).not.toHaveBeenCalled();
  });

  it("order-jobs sweeper enqueues for a stale null-jobs order", async () => {
    const f = await makeRecoveryFixture();
    const { orderId } = await makeOrderWithHeldHold(f);
    // status delivered (allowlisted), jobs null, created_at well in the past.
    await db
      .update(orders)
      .set({ jobsEnqueuedAt: null, createdAt: new Date(Date.now() - 60 * 60_000) })
      .where(eq(orders.id, orderId));

    const result = await runOrderJobsSweep();
    expect(result.enqueued).toBeGreaterThanOrEqual(1);

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.jobsEnqueuedAt).not.toBeNull();
  });

  it("order-jobs sweeper SKIPS refunded/cancelled orders (allowlist)", async () => {
    const f = await makeRecoveryFixture();
    const { orderId } = await makeOrderWithHeldHold(f);
    await db
      .update(orders)
      .set({ status: "cancelled", jobsEnqueuedAt: null, createdAt: new Date(Date.now() - 60 * 60_000) })
      .where(eq(orders.id, orderId));

    const result = await runOrderJobsSweep();

    // The cancelled order is not in the allowlist → not scanned/enqueued.
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.jobsEnqueuedAt).toBeNull();
    expect(result.scanned).toBe(0);
  });
});

// ── Payout release — shared core / worker branches ────────────────────────────

describe("Payout release — shared core branches", () => {
  it("happy path: releases + sets BOTH transfer-id columns", async () => {
    const f = await makeRecoveryFixture();
    const { orderId, holdId } = await makeOrderWithHeldHold(f);
    stripeMock.transfers.create.mockResolvedValue({ id: "tr_happy" });

    const outcome = await releasePayoutHold(holdId, "system");
    expect(outcome.result).toBe("released");

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("released");
    expect(hold!.transferId).toBe("tr_happy");

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.stripeTransferId).toBe("tr_happy");

    // Per-attempt idempotency key.
    expect(stripeMock.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ payoutHoldId: holdId }) }),
      expect.objectContaining({ idempotencyKey: `${holdId}:1` }),
    );
  });

  it("5xx → release_failed_retryable, op left indeterminate_5xx", async () => {
    const f = await makeRecoveryFixture();
    const { holdId } = await makeOrderWithHeldHold(f);
    stripeMock.transfers.create.mockRejectedValue(
      Object.assign(new Error("stripe down"), { statusCode: 503 }),
    );

    const outcome = await releasePayoutHold(holdId, "system");
    expect(outcome.result).toBe("retryable");

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("release_failed_retryable");
    expect(hold!.nextRetryAt).not.toBeNull();
    expect(hold!.releaseAttempts).toBe(1);

    const [op] = await db
      .select()
      .from(paymentOperations)
      .where(and(eq(paymentOperations.type, "transfer"), eq(paymentOperations.idempotencyKey, `${holdId}:1`)));
    expect(op!.status).toBe("indeterminate_5xx");
  });

  it("List-first adopts an already-landed transfer — NO double-create", async () => {
    const f = await makeRecoveryFixture();
    const { orderId, holdId } = await makeOrderWithHeldHold(f);

    // Attempt 1: 5xx (transfer actually landed at Stripe).
    stripeMock.transfers.create.mockRejectedValueOnce(
      Object.assign(new Error("stripe 5xx"), { statusCode: 500 }),
    );
    await releasePayoutHold(holdId, "system");

    // Make the hold retry-eligible.
    await db
      .update(payoutHolds)
      .set({ nextRetryAt: new Date(Date.now() - 1000) })
      .where(eq(payoutHolds.id, holdId));

    // Stripe List now returns the transfer that landed during attempt 1.
    stripeMock.transfers.list.mockResolvedValue({
      data: [{ id: "tr_landed", metadata: { payoutHoldId: holdId } }],
    });
    // If a create happens, it'd be a double-pay bug — make it loud.
    stripeMock.transfers.create.mockResolvedValue({ id: "tr_DOUBLE_PAY_BUG" });

    const outcome = await releasePayoutHold(holdId, "system");
    expect(outcome.result).toBe("adopted");

    // Adopted the listed transfer, did NOT create a second one in attempt 2.
    expect(stripeMock.transfers.create).toHaveBeenCalledTimes(1); // only attempt 1

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("released");
    expect(hold!.transferId).toBe("tr_landed");
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.stripeTransferId).toBe("tr_landed");
  });

  it("non-transferable seller → blocked", async () => {
    const f = await makeRecoveryFixture({ stripeReady: false });
    const { holdId } = await makeOrderWithHeldHold(f);

    const outcome = await releasePayoutHold(holdId, "system");
    expect(outcome.result).toBe("blocked");
    expect(stripeMock.transfers.create).not.toHaveBeenCalled();

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("blocked");
  });

  it("attempt cap (3 deterministic 4xx) → release_failed_manual + alert", async () => {
    const f = await makeRecoveryFixture();
    const { holdId } = await makeOrderWithHeldHold(f);
    stripeMock.transfers.create.mockRejectedValue(
      Object.assign(new Error("account_restricted"), { statusCode: 400, code: "account_restricted" }),
    );

    // Attempt 1 + 2 → retryable.
    await releasePayoutHold(holdId, "system");
    await db.update(payoutHolds).set({ nextRetryAt: new Date(Date.now() - 1000) }).where(eq(payoutHolds.id, holdId));
    await releasePayoutHold(holdId, "system");
    await db.update(payoutHolds).set({ nextRetryAt: new Date(Date.now() - 1000) }).where(eq(payoutHolds.id, holdId));
    // Attempt 3 → manual.
    const outcome = await releasePayoutHold(holdId, "system");
    expect(outcome.result).toBe("manual");

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("release_failed_manual");
    expect(hold!.releaseAttempts).toBe(3);
  });

  it("frozen hold is never released", async () => {
    const f = await makeRecoveryFixture();
    const { holdId } = await makeOrderWithHeldHold(f, { frozenAt: new Date() });

    const outcome = await releasePayoutHold(holdId, "system");
    expect(outcome.result).toBe("skipped");
    expect(stripeMock.transfers.create).not.toHaveBeenCalled();

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("held");
  });
});

// ── Payout-release worker sweep (WS5 orchestration) ──────────────────────────

describe("Payout-release worker — runPayoutReleaseSweep", () => {
  it("releases an eligible delivered hold and sets both transfer-id columns", async () => {
    const f = await makeRecoveryFixture();
    const { orderId, holdId } = await makeOrderWithHeldHold(f);
    stripeMock.transfers.create.mockResolvedValue({ id: "tr_swept" });

    const result = await runPayoutReleaseSweep();
    expect(result.released).toBeGreaterThanOrEqual(1);

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("released");
    expect(hold!.transferId).toBe("tr_swept");
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.stripeTransferId).toBe("tr_swept");
  });

  it("reserve gate skips a hold when balance - amount < threshold (leaves held)", async () => {
    const f = await makeRecoveryFixture();
    const { holdId } = await makeOrderWithHeldHold(f);
    // Balance below the $500 floor threshold so the gate trips.
    stripeMock.balance.retrieve.mockResolvedValue({
      available: [{ currency: "aud", amount: 100 }],
      pending: [],
    });
    stripeMock.transfers.create.mockResolvedValue({ id: "tr_should_not_happen" });

    const result = await runPayoutReleaseSweep();
    expect(result.reserveSkipped).toBeGreaterThanOrEqual(1);
    expect(stripeMock.transfers.create).not.toHaveBeenCalled();

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("held");
  });

  it("skips a hold with no real delivery/buyer signal", async () => {
    const f = await makeRecoveryFixture();
    // Hold with NO delivery signal — and clear the order's deliveryConfirmedAt.
    const { orderId, holdId } = await makeOrderWithHeldHold(f, { deliveryConfirmedAt: null });
    await db.update(orders).set({ deliveryConfirmedAt: null, status: "paid" }).where(eq(orders.id, orderId));
    // Make it a held candidate by giving a buyer signal-less delivery null. With
    // both null, the candidate query won't even select it.
    stripeMock.transfers.create.mockResolvedValue({ id: "tr_nope" });

    await runPayoutReleaseSweep();
    expect(stripeMock.transfers.create).not.toHaveBeenCalled();
    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("held");
  });
});

// ── Codex PR#27 money-safety regressions (C1, C2, H1, H2) ────────────────────

describe("Codex C1 — atomic WAL+finalise (reconcile double-transfer window)", () => {
  it("reconcile commits op-success + hold finalise atomically; a follow-up release does not double-transfer", async () => {
    const f = await makeRecoveryFixture();
    const { orderId, holdId } = await makeOrderWithHeldHold(f, {
      status: "release_failed_retryable",
    });

    // Seed a stale indeterminate_5xx transfer op for this order (the prior
    // attempt's 5xx). Its transfer actually landed at Stripe.
    const [op] = await db
      .insert(paymentOperations)
      .values({
        orderId,
        type: "transfer",
        idempotencyKey: `${holdId}:1`,
        amountCents: 5500,
        status: "indeterminate_5xx",
        createdAt: new Date(Date.now() - 60 * 60_000),
      })
      .returning({ id: paymentOperations.id });

    // List returns the landed transfer (matched on piklo_payment_op_id).
    stripeMock.transfers.list.mockResolvedValue({
      has_more: false,
      data: [{ id: "tr_reconciled", metadata: { piklo_payment_op_id: op!.id } }],
    });
    // A create here would be a double-pay bug.
    stripeMock.transfers.create.mockResolvedValue({ id: "tr_DOUBLE_PAY" });

    const swept = await runPayoutReleaseSweep();
    expect(swept.transfersReconciled).toBe(1);
    expect(stripeMock.transfers.create).not.toHaveBeenCalled();

    // Atomic outcome: op succeeded AND hold released with transferId AND order set.
    const [opAfter] = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.id, op!.id));
    expect(opAfter!.status).toBe("succeeded");
    expect(opAfter!.providerObjectId).toBe("tr_reconciled");

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("released");
    expect(hold!.transferId).toBe("tr_reconciled");
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.stripeTransferId).toBe("tr_reconciled");

    // Follow-up release call is a no-op skip (hold no longer releasable) — never
    // a second transfer.
    const outcome = await releasePayoutHold(holdId, "system");
    expect(outcome.result).toBe("skipped");
    expect(stripeMock.transfers.create).not.toHaveBeenCalled();
  });

  it("List-first adopt finalises op + hold + order together (no half-committed state)", async () => {
    const f = await makeRecoveryFixture();
    const { orderId, holdId } = await makeOrderWithHeldHold(f);

    // Attempt 1: 5xx (transfer landed at Stripe).
    stripeMock.transfers.create.mockRejectedValueOnce(
      Object.assign(new Error("stripe 5xx"), { statusCode: 500 }),
    );
    await releasePayoutHold(holdId, "system");
    await db
      .update(payoutHolds)
      .set({ nextRetryAt: new Date(Date.now() - 1000) })
      .where(eq(payoutHolds.id, holdId));

    stripeMock.transfers.list.mockResolvedValue({
      has_more: false,
      data: [{ id: "tr_adopt", metadata: { payoutHoldId: holdId } }],
    });
    stripeMock.transfers.create.mockResolvedValue({ id: "tr_DOUBLE_PAY" });

    const outcome = await releasePayoutHold(holdId, "system");
    expect(outcome.result).toBe("adopted");
    expect(stripeMock.transfers.create).toHaveBeenCalledTimes(1); // attempt 1 only

    const [op] = await db
      .select()
      .from(paymentOperations)
      .where(and(eq(paymentOperations.type, "transfer"), eq(paymentOperations.idempotencyKey, `${holdId}:1`)));
    expect(op!.status).toBe("succeeded");
    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("released");
    expect(hold!.transferId).toBe("tr_adopt");
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.stripeTransferId).toBe("tr_adopt");
  });
});

describe("Codex C2 — List-first paginates past page 1 + scopes by transfer_group", () => {
  it("adopts a transfer hidden on page 2 (has_more) — no double-create", async () => {
    const f = await makeRecoveryFixture();
    const { orderId, holdId } = await makeOrderWithHeldHold(f);

    // Attempt 1: 5xx (transfer landed but is on a later page for a busy seller).
    stripeMock.transfers.create.mockRejectedValueOnce(
      Object.assign(new Error("stripe 5xx"), { statusCode: 500 }),
    );
    await releasePayoutHold(holdId, "system");
    await db
      .update(payoutHolds)
      .set({ nextRetryAt: new Date(Date.now() - 1000) })
      .where(eq(payoutHolds.id, holdId));

    // Page 1: 100 unrelated transfers, has_more=true. Page 2: the real one.
    const page1 = Array.from({ length: 100 }, (_v, i) => ({
      id: `tr_other_${i}`,
      metadata: { payoutHoldId: "someoneElse" },
    }));
    stripeMock.transfers.list
      .mockResolvedValueOnce({ has_more: true, data: page1 })
      .mockResolvedValueOnce({
        has_more: false,
        data: [{ id: "tr_page2", metadata: { payoutHoldId: holdId } }],
      });
    stripeMock.transfers.create.mockResolvedValue({ id: "tr_DOUBLE_PAY" });

    const outcome = await releasePayoutHold(holdId, "system");
    expect(outcome.result).toBe("adopted");
    expect((outcome as { transferId: string }).transferId).toBe("tr_page2");
    // Created only on attempt 1; paginated lookup found it on page 2.
    expect(stripeMock.transfers.create).toHaveBeenCalledTimes(1);
    // Two list pages requested, the second with starting_after = last id of page 1.
    expect(stripeMock.transfers.list).toHaveBeenCalledTimes(2);
    expect(stripeMock.transfers.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        transfer_group: orderId,
        starting_after: "tr_other_99",
      }),
    );
  });

  it("transfers.create sets transfer_group = orderId (so the lookup is reliable)", async () => {
    const f = await makeRecoveryFixture();
    const { orderId, holdId } = await makeOrderWithHeldHold(f);
    stripeMock.transfers.create.mockResolvedValue({ id: "tr_grp" });

    await releasePayoutHold(holdId, "system");

    expect(stripeMock.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({ transfer_group: orderId }),
      expect.anything(),
    );
  });
});

describe("Codex H1 — balance_insufficient never poisons the idempotency key", () => {
  it("does NOT decrement releaseAttempts; bumps funding_deferrals; next retry uses a fresh key", async () => {
    const f = await makeRecoveryFixture();
    const { holdId } = await makeOrderWithHeldHold(f);

    // Attempt 1: balance_insufficient → back to held.
    stripeMock.transfers.create.mockRejectedValueOnce(
      Object.assign(new Error("Insufficient funds"), {
        statusCode: 400,
        code: "balance_insufficient",
      }),
    );
    const out1 = await releasePayoutHold(holdId, "system");
    expect(out1.result).toBe("skipped");

    const [holdAfter1] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(holdAfter1!.status).toBe("held");
    // Monotonic: attempt counter NOT rolled back.
    expect(holdAfter1!.releaseAttempts).toBe(1);
    expect(holdAfter1!.fundingDeferrals).toBe(1);

    // Attempt 2: succeeds. Key must be `:2` (advanced), NOT a reused `:1`.
    stripeMock.transfers.create.mockResolvedValueOnce({ id: "tr_funded" });
    const out2 = await releasePayoutHold(holdId, "system");
    expect(out2.result).toBe("released");
    expect(stripeMock.transfers.create).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: `${holdId}:2` }),
    );

    const [holdAfter2] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(holdAfter2!.status).toBe("released");
    expect(holdAfter2!.releaseAttempts).toBe(2);
  });

  it("funding deferrals do not burn the manual-intervention cap", async () => {
    const f = await makeRecoveryFixture();
    const { holdId } = await makeOrderWithHeldHold(f);

    // Three consecutive balance_insufficient deferrals — must NOT reach the cap.
    stripeMock.transfers.create.mockRejectedValue(
      Object.assign(new Error("Insufficient funds"), {
        statusCode: 400,
        code: "balance_insufficient",
      }),
    );
    for (let i = 0; i < 3; i++) {
      const out = await releasePayoutHold(holdId, "system");
      expect(out.result).toBe("skipped");
    }

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    // Still releasable (held), not release_failed_manual.
    expect(hold!.status).toBe("held");
    expect(hold!.releaseAttempts).toBe(3);
    expect(hold!.fundingDeferrals).toBe(3);
  });
});

describe("Codex H2 — freeze mid-flight (after entry CAS) blocks the transfer", () => {
  it("a freeze landing before transfers.create aborts the release; no payout", async () => {
    const f = await makeRecoveryFixture();
    const { holdId } = await makeOrderWithHeldHold(f);

    // Simulate a freeze landing AFTER the held→releasing CAS but BEFORE
    // transfers.create: apply it as a side effect of createPaymentOp (which the
    // release core awaits immediately before the pre-create freeze re-check).
    // createPaymentOp(orderId, ...) is awaited by the release core immediately
    // before its pre-create freeze re-check; apply the freeze as its side effect.
    const realCreate = paymentOps.createPaymentOp;
    const spy = vi
      .spyOn(paymentOps, "createPaymentOp")
      .mockImplementation(async (...args: Parameters<typeof realCreate>) => {
        const op = await realCreate(...args);
        const orderId = args[0] as string;
        await freezePayoutHold(orderId); // freeze arrives now (e.g. a dispute webhook)
        return op;
      });

    stripeMock.transfers.create.mockResolvedValue({ id: "tr_SHOULD_NOT_HAPPEN" });

    const outcome = await releasePayoutHold(holdId, "system");
    expect(outcome.result).toBe("skipped");
    expect((outcome as { reason: string }).reason).toContain("frozen");
    // Critical: no transfer was created.
    expect(stripeMock.transfers.create).not.toHaveBeenCalled();

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    // Released? Never. The hold is frozen and back to held (or releasing-but-frozen).
    expect(hold!.status).not.toBe("released");
    expect(hold!.transferId).toBeNull();
    expect(hold!.frozenAt).not.toBeNull();

    spy.mockRestore();
  });

  it("freeze is serialised by an advisory lock (concurrent freeze + release is safe)", async () => {
    const f = await makeRecoveryFixture();
    const { holdId } = await makeOrderWithHeldHold(f, { frozenAt: new Date() });

    // Already frozen at entry — belt guard skips before any Stripe call.
    const outcome = await releasePayoutHold(holdId, "system");
    expect(outcome.result).toBe("skipped");
    expect(stripeMock.transfers.create).not.toHaveBeenCalled();
  });

  it("session-scoped lock spans the Stripe transfer: a concurrent freeze is blocked until the release finalises, and cannot interleave during transfers.create", async () => {
    const f = await makeRecoveryFixture();
    const { orderId, holdId } = await makeOrderWithHeldHold(f);

    // Barrier: `transfers.create` parks here so we can observe the in-flight
    // window. The advisory lock is held across this whole network call.
    let enteredTransfer: () => void = () => {};
    let releaseTransfer: () => void = () => {};
    // Signals that we are now INSIDE transfers.create (lock is held).
    const transferInFlight = new Promise<void>((resolve) => {
      enteredTransfer = resolve;
    });
    const transferGate = new Promise<void>((resolve) => {
      releaseTransfer = resolve;
    });

    // Track whether the concurrent freeze committed BEFORE the transfer
    // completed. With the session-scoped lock it must NOT — the freeze blocks on
    // the lock until the release releases it in `finally`.
    let freezeCommittedAt: number | null = null;
    let transferReturnedAt: number | null = null;

    stripeMock.transfers.create.mockImplementation(async () => {
      enteredTransfer();
      await transferGate; // hold the lock across the "network call"
      transferReturnedAt = Date.now();
      return { id: "tr_locked" };
    });

    // Kick off the release. It will acquire the session lock, pass the
    // freeze re-check (not yet frozen), then park inside transfers.create.
    const releasePromise = releasePayoutHold(holdId, "system");

    // Wait until the release is inside transfers.create (lock held).
    await transferInFlight;

    // Fire a concurrent freeze (e.g. a dispute webhook landing mid-flight). It
    // takes the SAME advisory key and MUST block on the session lock until the
    // release finishes — so it cannot set frozen_at during the transfer window.
    const freezePromise = freezePayoutHold(orderId).then(() => {
      freezeCommittedAt = Date.now();
    });

    // Give the freeze a real chance to (incorrectly) commit while the transfer
    // is still in flight. Under the broken xact-scoped lock the freeze would not
    // block here and would land now; under the fix it stays blocked.
    await new Promise((r) => setTimeout(r, 150));
    expect(freezeCommittedAt).toBeNull(); // freeze still blocked on the lock

    // Now let the transfer return. The release finalises and releases the lock;
    // only then can the (now-too-late) freeze proceed.
    releaseTransfer();

    const outcome = await releasePromise;
    await freezePromise;

    // The transfer completed and the hold released — the freeze could not abort
    // a transfer that was already serialised behind the lock.
    expect(outcome.result).toBe("released");
    expect((outcome as { transferId: string }).transferId).toBe("tr_locked");
    expect(stripeMock.transfers.create).toHaveBeenCalledTimes(1);

    // Ordering proof: the freeze only committed AFTER the transfer returned.
    expect(transferReturnedAt).not.toBeNull();
    expect(freezeCommittedAt).not.toBeNull();
    expect(freezeCommittedAt!).toBeGreaterThanOrEqual(transferReturnedAt!);

    // Final DB state: released with the transfer id. The frozen_at the late
    // freeze set is harmless (the funds had already, correctly, moved before the
    // dispute arrived) — what matters is no frozen payout went out under a freeze
    // that beat the transfer.
    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("released");
    expect(hold!.transferId).toBe("tr_locked");
  });

  it("a freeze that wins the lock BEFORE the release re-check aborts the transfer (no payout to a frozen hold)", async () => {
    const f = await makeRecoveryFixture();
    const { holdId } = await makeOrderWithHeldHold(f);

    // Simulate the freeze winning: it commits frozen_at after the entry CAS but
    // before the pre-transfer re-check reads it. Applied as a createPaymentOp
    // side effect, which the release core awaits immediately before acquiring
    // the lock + re-checking frozen_at.
    const realCreate = paymentOps.createPaymentOp;
    const spy = vi
      .spyOn(paymentOps, "createPaymentOp")
      .mockImplementation(async (...args: Parameters<typeof realCreate>) => {
        const op = await realCreate(...args);
        await freezePayoutHold(args[0] as string);
        return op;
      });

    stripeMock.transfers.create.mockResolvedValue({ id: "tr_SHOULD_NOT_HAPPEN" });

    const outcome = await releasePayoutHold(holdId, "system");
    expect(outcome.result).toBe("skipped");
    expect((outcome as { reason: string }).reason).toContain("frozen");
    // The transfer was never created for a frozen hold.
    expect(stripeMock.transfers.create).not.toHaveBeenCalled();

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).not.toBe("released");
    expect(hold!.transferId).toBeNull();
    expect(hold!.frozenAt).not.toBeNull();

    spy.mockRestore();
  });
});

// ── Codex review #3 — single-connection finalise (pool self-deadlock fix) ─────

describe("Codex review #3 — successful release finalises on the reserved connection (one pool connection)", () => {
  it("does NOT open a second pooled db.transaction for the finalise; uses exactly one reserved connection", async () => {
    const f = await makeRecoveryFixture();
    const { orderId, holdId } = await makeOrderWithHeldHold(f);

    stripeMock.transfers.create.mockResolvedValue({ id: "tr_single_conn" });

    // The H2 lock fix originally finalised via `db.transaction()` while still
    // holding a reserved connection + its session-scoped advisory lock — two
    // connections from the same pool per release, which can self-deadlock under
    // concurrent admin releases (and, with the `finally` unreached, leak the
    // lock forever). The fix runs the finalise on the SAME reserved connection.
    const reserveSpy = vi.spyOn(pgClient, "reserve");
    const txSpy = vi.spyOn(db, "transaction");

    const outcome = await releasePayoutHold(holdId, "system");

    expect(outcome.result).toBe("released");
    expect((outcome as { transferId: string }).transferId).toBe("tr_single_conn");

    // Exactly one connection reserved for the whole locked critical section.
    expect(reserveSpy).toHaveBeenCalledTimes(1);
    // No SECOND pooled connection grabbed for the finalise transaction — the
    // finalise ran on the reserved connection via reservedTransaction().
    expect(txSpy).not.toHaveBeenCalled();

    // The atomic finalise still committed everything (C1 invariant intact):
    // WAL op succeeded + hold released w/ transferId + orders.stripeTransferId.
    const [op] = await db
      .select()
      .from(paymentOperations)
      .where(
        and(
          eq(paymentOperations.type, "transfer"),
          eq(paymentOperations.idempotencyKey, `${holdId}:1`),
        ),
      );
    expect(op!.status).toBe("succeeded");
    expect(op!.providerObjectId).toBe("tr_single_conn");
    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("released");
    expect(hold!.transferId).toBe("tr_single_conn");
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.stripeTransferId).toBe("tr_single_conn");

    reserveSpy.mockRestore();
    txSpy.mockRestore();
  });
});

// ── admin-alerts ──────────────────────────────────────────────────────────────

describe("admin-alerts", () => {
  it("sends an email to ADMIN_EMAIL", async () => {
    process.env.ADMIN_EMAIL = "ops@piklo.com.au";
    // Force the mock sender path.
    delete process.env.RESEND_API_KEY;
    _resetEmailSender();
    getEmailSender();

    await enqueueAdminAlert({ type: "payout_release_failed_manual", holdId: "h1", reason: "test" });

    const sent = getSentEmails();
    expect(sent.length).toBe(1);
    expect(sent[0]!.to).toBe("ops@piklo.com.au");
    expect(sent[0]!.subject).toContain("payout_release_failed_manual");
  });

  it("does NOT throw when the email sender fails", async () => {
    delete process.env.RESEND_API_KEY;
    _resetEmailSender();
    getEmailSender();
    setMockEmailError("smtp exploded");

    await expect(
      enqueueAdminAlert({ type: "resurrected_auto_failed_op", opId: "o1" }),
    ).resolves.toBeUndefined();
  });
});
