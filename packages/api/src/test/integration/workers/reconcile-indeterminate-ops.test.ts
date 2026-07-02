/**
 * Reconcile Indeterminate Ops Worker Integration Test
 *
 * LB-F8-WAL-WORKER Part 1 — verifies that `reconcileIndeterminateOps` is
 * callable and finds stuck `payment_operations` rows after the worker
 * registration hotfix.
 *
 * The deep reconciliation logic (Stripe List → metadata match → transition)
 * is already covered by `packages/api/src/lib/refund-service.test.ts`
 * (see `describe("reconcileRefundOpFromStripe")`). This test is narrower:
 * it asserts the reconciler function is exported + callable + correctly
 * identifies stuck ops, and that the BullMQ worker starter exports exist
 * so `startWorkers()` can wire them up.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ulid } from "ulid";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  orders,
  carts,
  checkoutSessions,
  paymentOperations,
  user,
} from "@bushpop/db/schema";
import { getBushpopChannel } from "../../helpers/get-channel.js";

// ── Mock Stripe so the reconciler doesn't make real API calls ───────────────

vi.mock("../../../lib/stripe.js", () => {
  const stripe = {
    refunds: {
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    transfers: {
      retrieve: vi.fn().mockResolvedValue({ reversals: { data: [] } }),
    },
  };
  return {
    getStripe: vi.fn(() => stripe),
  };
});

// ── Imports after mocks ─────────────────────────────────────────────────────

import {
  reconcileIndeterminateOps,
  scheduleReconcileIndeterminateOps,
  startReconcileIndeterminateOpsWorker,
  RECONCILE_QUEUE,
} from "../../../workers/reconcile-indeterminate-ops.js";

// ── Fixture helpers ─────────────────────────────────────────────────────────

async function createStuckOp(type: "refund" | "reversal"): Promise<string> {
  const channel = await getBushpopChannel();
  const buyerId = ulid();
  const sellerId = ulid();
  const cartId = ulid();
  const csId = ulid();
  const orderId = ulid();

  await db.insert(user).values({
    id: buyerId,
    name: "LB-F8 Buyer",
    email: `buyer-${buyerId.toLowerCase()}@example.com`,
    emailVerified: true,
  });
  await db.insert(user).values({
    id: sellerId,
    name: "LB-F8 Seller",
    email: `seller-${sellerId.toLowerCase()}@example.com`,
    emailVerified: true,
  });
  await db.insert(carts).values({
    id: cartId,
    buyerId,
    channelId: channel.id,
  });
  await db.insert(checkoutSessions).values({
    id: csId,
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
  });
  await db.insert(orders).values({
    id: orderId,
    checkoutSessionId: csId,
    buyerId,
    sellerId,
    channelId: channel.id,
    status: "paid",
    subtotalCents: 5000,
    shippingCents: 1000,
    platformFeeCents: 500,
    sellerProceedsCents: 5500,
    totalCents: 6000,
    currency: "AUD",
    stripePaymentIntentId: `pi_test_${orderId.toLowerCase()}`,
    stripeTransferId:
      type === "reversal" ? `tr_test_${orderId.toLowerCase()}` : null,
  });

  const [op] = await db
    .insert(paymentOperations)
    .values({
      orderId,
      type,
      idempotencyKey: `idem_${ulid()}`,
      amountCents: 6000,
      status: "indeterminate_5xx",
      lastError: "simulated 5xx",
    })
    .returning();

  return op!.id;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("reconcile-indeterminate-ops worker — LB-F8-WAL-WORKER Part 1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports scheduler + worker starter so workers/index.ts can wire them", () => {
    expect(typeof scheduleReconcileIndeterminateOps).toBe("function");
    expect(typeof startReconcileIndeterminateOpsWorker).toBe("function");
    expect(RECONCILE_QUEUE).toBe("reconcile-indeterminate-ops");
  });

  it("reconcileIndeterminateOps finds a stuck refund op (grace=0)", async () => {
    const opId = await createStuckOp("refund");

    // Use grace=0 so the op is immediately eligible for reconciliation.
    const result = await reconcileIndeterminateOps(0);

    expect(result.scanned).toBeGreaterThanOrEqual(1);

    // With the Stripe mock returning no matching refunds, the op stays stuck
    // but is scanned. This proves the scan path works end-to-end.
    const [opAfter] = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.id, opId));
    expect(opAfter!.status).toBe("indeterminate_5xx");
  });

  it("reconcileIndeterminateOps finds a stuck reversal op (grace=0)", async () => {
    const opId = await createStuckOp("reversal");

    const result = await reconcileIndeterminateOps(0);

    expect(result.scanned).toBeGreaterThanOrEqual(1);

    const [opAfter] = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.id, opId));
    expect(opAfter!.status).toBe("indeterminate_5xx");
  });

  it("reconcileIndeterminateOps returns zero when grace hasn't elapsed", async () => {
    await createStuckOp("refund");

    // grace=999999 minutes means no op is old enough to be eligible.
    const result = await reconcileIndeterminateOps(999999);

    expect(result.scanned).toBe(0);
    expect(result.reconciled).toBe(0);
    expect(result.stillStuck).toBe(0);
  });
});
