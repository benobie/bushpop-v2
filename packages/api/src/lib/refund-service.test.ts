import { describe, it, expect, vi, beforeEach } from "vitest";
import { ulid } from "ulid";
import { eq, sql, and } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  orders,
  checkoutSessions,
  carts,
  payoutHolds,
  refunds,
  paymentOperations,
  channelListings,
  inventoryItems,
  orderItems,
  user,
} from "@bushpop/db/schema";
import { getBushpopChannel } from "../test/helpers/get-channel.js";
import { ConflictError, ForbiddenError } from "./errors.js";
import {
  processRefund,
  resumePendingRefunds,
  IndeterminateStripeError,
  reconcileRefundOpFromStripe,
  reconcileReversalOpFromStripe,
} from "./refund-service.js";
import { enqueueAdminAlert } from "./admin-alerts.js";

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports to allow vi.mock hoisting
// ---------------------------------------------------------------------------

vi.mock("./stripe.js");
vi.mock("../workers/email.js", () => ({
  enqueueEmail: vi.fn().mockResolvedValue(undefined),
  startEmailWorker: vi.fn(),
  EMAIL_QUEUE: "email",
}));

import { getStripe } from "./stripe.js";

// ---------------------------------------------------------------------------
// Test setup — configure Stripe mock before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Rebuild the stripe mock for each test
  vi.mocked(getStripe).mockReturnValue({
    refunds: {
      create: vi.fn().mockResolvedValue({
        id: "re_test_stripe_123",
        object: "refund",
        amount: 6000,
        status: "succeeded",
      }),
    },
    transfers: {
      createReversal: vi.fn().mockResolvedValue({
        id: "trr_test_stripe_123",
        object: "transfer_reversal",
        amount: 5500,
      }),
    },
  } as unknown as ReturnType<typeof getStripe>);
});

// ---------------------------------------------------------------------------
// Fixture helpers (called inside test bodies, after beforeEach)
// ---------------------------------------------------------------------------

interface TestFixture {
  orderId: string;
  buyerId: string;
  sellerId: string;
  channelId: string;
  holdId: string;
}

async function createOrderFixture(
  overrides: {
    orderStatus?: string;
    holdStatus?: string;
    stripeTransferId?: string | null;
  } = {},
): Promise<TestFixture> {
  const channel = await getBushpopChannel();
  const buyerId = ulid();
  const sellerId = ulid();
  const cartId = ulid();
  const csId = ulid();
  const orderId = ulid();
  const holdId = ulid();

  await db.insert(user).values({
    id: buyerId,
    name: "Test Buyer",
    email: `buyer-${buyerId.toLowerCase()}@example.com`,
    emailVerified: true,
  });

  await db.insert(user).values({
    id: sellerId,
    name: "Test Seller",
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
    status: overrides.orderStatus ?? "paid",
    subtotalCents: 5000,
    shippingCents: 1000,
    platformFeeCents: 500,
    sellerProceedsCents: 5500,
    totalCents: 6000,
    currency: "AUD",
    stripePaymentIntentId: "pi_test_123",
    stripeTransferId:
      overrides.stripeTransferId !== undefined
        ? overrides.stripeTransferId
        : overrides.holdStatus === "released"
          ? "tr_test_123"
          : null,
  });

  await db.insert(payoutHolds).values({
    id: holdId,
    orderId,
    sellerStripeAccountId: "acct_test_seller",
    amountCents: 5500,
    currency: "AUD",
    status: overrides.holdStatus ?? "held",
    version: 1,
  });

  return { orderId, buyerId, sellerId, channelId: channel.id, holdId };
}

// ---------------------------------------------------------------------------
// Pre-transfer refund (hold = held)
// ---------------------------------------------------------------------------

describe("processRefund — pre-transfer path (held)", () => {
  it("refunds buyer, marks order refunded, marks hold refunded, creates succeeded payment op", async () => {
    const { orderId, sellerId, holdId } = await createOrderFixture({ holdStatus: "held" });

    await processRefund(orderId, sellerId, "buyer request");

    // Order should be refunded
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("refunded");

    // Refund row should be processed
    const [refund] = await db.select().from(refunds).where(eq(refunds.orderId, orderId));
    expect(refund!.status).toBe("processed");
    expect(refund!.stripeRefundId).toBe("re_test_stripe_123");

    // Payout hold should be refunded
    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("refunded");

    // Payment operation should be succeeded
    const ops = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.orderId, orderId));
    expect(ops.length).toBe(1);
    expect(ops[0]!.status).toBe("succeeded");
    expect(ops[0]!.type).toBe("refund");
    expect(ops[0]!.providerObjectId).toBe("re_test_stripe_123");
  });
});

// ---------------------------------------------------------------------------
// Post-transfer refund (hold = released)
// ---------------------------------------------------------------------------

describe("processRefund — post-transfer path (released)", () => {
  it("transitions order to refund_in_progress, creates refund + reversal ops, marks order refunded", async () => {
    const { orderId, sellerId } = await createOrderFixture({
      orderStatus: "delivered",
      holdStatus: "released",
    });

    await processRefund(orderId, sellerId, "buyer request");

    // Order should end up refunded
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("refunded");

    // Refund should be processed
    const [refund] = await db.select().from(refunds).where(eq(refunds.orderId, orderId));
    expect(refund!.status).toBe("processed");

    // Two payment ops: one refund, one reversal
    const ops = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.orderId, orderId));
    expect(ops.length).toBe(2);

    const refundOp = ops.find((o) => o.type === "refund");
    const reversalOp = ops.find((o) => o.type === "reversal");
    expect(refundOp!.status).toBe("succeeded");
    expect(reversalOp!.status).toBe("succeeded");
  });
});

// ---------------------------------------------------------------------------
// Idempotency — second processRefund → ConflictError
// ---------------------------------------------------------------------------

describe("processRefund — idempotency", () => {
  it("throws ConflictError when an active refund already exists", async () => {
    const { orderId, sellerId } = await createOrderFixture({ holdStatus: "held" });

    await processRefund(orderId, sellerId, "first refund");

    await expect(
      processRefund(orderId, sellerId, "duplicate refund"),
    ).rejects.toThrow(ConflictError);
  });
});

// ---------------------------------------------------------------------------
// Invalid state — order already completed → ConflictError
// ---------------------------------------------------------------------------

describe("processRefund — invalid state", () => {
  it("throws ConflictError when order is in a terminal state (completed)", async () => {
    const { orderId, sellerId } = await createOrderFixture({
      orderStatus: "completed",
      holdStatus: "released",
    });

    await expect(
      processRefund(orderId, sellerId, "too late"),
    ).rejects.toThrow(ConflictError);
  });
});

// ---------------------------------------------------------------------------
// Inventory restore — only sold listings are reset to paused
// ---------------------------------------------------------------------------

describe("processRefund — inventory restore", () => {
  it("resets sold channel listings to paused, leaves non-sold listings intact", async () => {
    const { orderId, sellerId } = await createOrderFixture({ holdStatus: "held" });
    const channel = await getBushpopChannel();

    const soldItemId = ulid();
    const activeItemId = ulid();
    const soldListingId = ulid();
    const activeListingId = ulid();

    await db.insert(inventoryItems).values({
      id: soldItemId,
      ownerId: sellerId,
      title: "Sold Item",
      availabilityStatus: "sold",
      lifecycleState: "sold",
    });

    await db.insert(inventoryItems).values({
      id: activeItemId,
      ownerId: sellerId,
      title: "Active Item",
      availabilityStatus: "available",
      lifecycleState: "for_sale",
    });

    await db.insert(channelListings).values({
      id: soldListingId,
      inventoryItemId: soldItemId,
      channelId: channel.id,
      title: "Sold Listing",
      priceCents: 5000,
      handle: `sold-${ulid()}`,
      status: "sold",
    });

    await db.insert(channelListings).values({
      id: activeListingId,
      inventoryItemId: activeItemId,
      channelId: channel.id,
      title: "Active Listing",
      priceCents: 3000,
      handle: `active-${ulid()}`,
      status: "active",
    });

    await db.insert(orderItems).values([
      {
        id: ulid(),
        orderId,
        channelListingId: soldListingId,
        priceCents: 5000,
        currency: "AUD",
      },
      {
        id: ulid(),
        orderId,
        channelListingId: activeListingId,
        priceCents: 3000,
        currency: "AUD",
      },
    ]);

    await processRefund(orderId, sellerId, "refund with inventory restore");

    const [updatedSoldListing] = await db
      .select()
      .from(channelListings)
      .where(eq(channelListings.id, soldListingId));
    expect(updatedSoldListing!.status).toBe("paused");

    const [updatedActiveListing] = await db
      .select()
      .from(channelListings)
      .where(eq(channelListings.id, activeListingId));
    expect(updatedActiveListing!.status).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// Crash recovery — resumePendingRefunds
// ---------------------------------------------------------------------------

describe("resumePendingRefunds", () => {
  it("completes a stale pending refund op by re-calling Stripe with the same idempotency key", async () => {
    const { orderId } = await createOrderFixture({ holdStatus: "held" });

    // Simulate crash: insert a pending refund op older than 5 minutes
    const staleOpId = ulid();
    const staleKey = `refund_${ulid()}`;
    await db.insert(paymentOperations).values({
      id: staleOpId,
      orderId,
      type: "refund",
      idempotencyKey: staleKey,
      amountCents: 6000,
      status: "pending",
    });
    // Backdate the op
    await db.execute(sql`
      UPDATE payment_operations
      SET created_at = now() - interval '10 minutes'
      WHERE id = ${staleOpId}
    `);

    await resumePendingRefunds();

    // Get the stripe mock that was used during this test
    const stripe = vi.mocked(getStripe)();

    // Stripe refund should have been called with the same idempotency key
    // and the recovery-path metadata pointer (LB-3).
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: "pi_test_123",
        metadata: expect.objectContaining({ piklo_payment_op_id: staleOpId }),
      }),
      { idempotencyKey: staleKey },
    );

    // Op should be succeeded
    const [op] = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.id, staleOpId));
    expect(op!.status).toBe("succeeded");
    expect(op!.providerObjectId).toBe("re_test_stripe_123");
  });
});

// ---------------------------------------------------------------------------
// FM-8 — post-transfer WAL ordering (reversal op pre-created before refund
// op is marked succeeded, so a crash mid-flow is recoverable).
// ---------------------------------------------------------------------------

describe("processRefund — FM-8 post-transfer WAL ordering", () => {
  it("creates the reversal payment_op BEFORE succeeding the refund op", async () => {
    const { orderId, sellerId } = await createOrderFixture({
      orderStatus: "delivered",
      holdStatus: "released",
    });

    // Intercept succeedPaymentOp ordering by capturing the order in which ops
    // reach `succeeded` and `pending` states. With FM-8, the reversal row
    // must exist (even if still pending) at the moment the refund op flips
    // to succeeded. We assert this by spying on Stripe.createReversal and
    // inspecting DB state the instant it's called.
    const stripeMock = vi.mocked(getStripe)();

    let reversalExistedWhenRefundSucceeded = false;

    // Wrap succeedPaymentOp observation via Stripe.createReversal entry point:
    // at that moment, both ops must already exist in the DB.
    const originalCreateReversal = stripeMock.transfers.createReversal as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    stripeMock.transfers.createReversal = vi.fn(async (...args: unknown[]) => {
      const ops = await db
        .select()
        .from(paymentOperations)
        .where(eq(paymentOperations.orderId, orderId));
      const refundOp = ops.find((o) => o.type === "refund");
      const reversalOp = ops.find((o) => o.type === "reversal");
      reversalExistedWhenRefundSucceeded =
        refundOp?.status === "succeeded" && !!reversalOp;
      return originalCreateReversal.apply(stripeMock.transfers, args);
    }) as unknown as typeof stripeMock.transfers.createReversal;

    await processRefund(orderId, sellerId, "buyer request");

    expect(reversalExistedWhenRefundSucceeded).toBe(true);

    // Final state: both ops succeeded
    const finalOps = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.orderId, orderId));
    expect(finalOps).toHaveLength(2);
    expect(finalOps.find((o) => o.type === "refund")!.status).toBe("succeeded");
    expect(finalOps.find((o) => o.type === "reversal")!.status).toBe("succeeded");
  });
});

// ---------------------------------------------------------------------------
// LB-3 — Stripe 5xx → indeterminate_5xx, webhook reconciles
// ---------------------------------------------------------------------------

describe("processRefund — LB-3 5xx indeterminate handling", () => {
  it("transitions the refund op to indeterminate_5xx on Stripe 503 and leaves refund row pending", async () => {
    const { orderId, sellerId } = await createOrderFixture({ holdStatus: "held" });

    const stripeMock = vi.mocked(getStripe)();
    (stripeMock.refunds.create as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error("Service Unavailable"), {
        statusCode: 503,
        type: "api_error",
      }),
    );

    await expect(
      processRefund(orderId, sellerId, "buyer request"),
    ).rejects.toBeInstanceOf(IndeterminateStripeError);

    const ops = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.orderId, orderId));
    expect(ops).toHaveLength(1);
    expect(ops[0]!.status).toBe("indeterminate_5xx");
    expect(ops[0]!.lastError).toContain("Service Unavailable");

    // Refund row is pending — webhook will finalise it. Must NOT be failed.
    const [refund] = await db.select().from(refunds).where(eq(refunds.orderId, orderId));
    expect(refund!.status).toBe("pending");

    // Order is untouched (still paid), hold is untouched (still held)
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("paid");
  });

  it("resumePendingRefunds skips indeterminate_5xx ops (does not replay same key)", async () => {
    const { orderId } = await createOrderFixture({ holdStatus: "held" });

    const staleOpId = ulid();
    await db.insert(paymentOperations).values({
      id: staleOpId,
      orderId,
      type: "refund",
      idempotencyKey: `refund_${ulid()}`,
      amountCents: 6000,
      status: "indeterminate_5xx",
      lastError: "prior 503",
    });
    await db.execute(sql`
      UPDATE payment_operations
      SET created_at = now() - interval '10 minutes'
      WHERE id = ${staleOpId}
    `);

    await resumePendingRefunds();

    const stripe = vi.mocked(getStripe)();
    expect(stripe.refunds.create).not.toHaveBeenCalled();

    const [op] = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.id, staleOpId));
    expect(op!.status).toBe("indeterminate_5xx");
  });
});

// ---------------------------------------------------------------------------
// LB-3 — webhook reconciliation helpers
// ---------------------------------------------------------------------------

describe("reconcileRefundOpFromStripe", () => {
  it("transitions indeterminate_5xx → succeeded and finalises the refund + order + hold", async () => {
    const { orderId, holdId } = await createOrderFixture({ holdStatus: "held" });

    // Insert a refund row in pending + an indeterminate_5xx refund op
    const refundId = ulid();
    await db.insert(refunds).values({
      id: refundId,
      orderId,
      initiatedBy: (await db.select().from(orders).where(eq(orders.id, orderId)))[0]!.sellerId,
      reason: "test",
      type: "full",
      amountCents: 6000,
      platformFeeRefundedCents: 500,
      status: "pending",
    });

    const opId = ulid();
    await db.insert(paymentOperations).values({
      id: opId,
      orderId,
      type: "refund",
      idempotencyKey: `refund_${refundId}`,
      amountCents: 6000,
      status: "indeterminate_5xx",
      lastError: "503",
    });

    await reconcileRefundOpFromStripe(opId, "re_reconciled_123");

    const [op] = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.id, opId));
    expect(op!.status).toBe("succeeded");
    expect(op!.providerObjectId).toBe("re_reconciled_123");

    const [refund] = await db
      .select()
      .from(refunds)
      .where(eq(refunds.id, refundId));
    expect(refund!.status).toBe("processed");
    expect(refund!.stripeRefundId).toBe("re_reconciled_123");

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("refunded");

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("refunded");
  });

  it("is idempotent against repeated webhook deliveries", async () => {
    const { orderId } = await createOrderFixture({ holdStatus: "held" });

    const refundId = ulid();
    await db.insert(refunds).values({
      id: refundId,
      orderId,
      initiatedBy: (await db.select().from(orders).where(eq(orders.id, orderId)))[0]!.sellerId,
      reason: "test",
      type: "full",
      amountCents: 6000,
      platformFeeRefundedCents: 500,
      status: "pending",
    });

    const opId = ulid();
    await db.insert(paymentOperations).values({
      id: opId,
      orderId,
      type: "refund",
      idempotencyKey: `refund_${refundId}`,
      amountCents: 6000,
      status: "indeterminate_5xx",
    });

    await reconcileRefundOpFromStripe(opId, "re_x");
    // Second delivery should short-circuit via CAS
    await expect(
      reconcileRefundOpFromStripe(opId, "re_x"),
    ).resolves.not.toThrow();

    const [op] = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.id, opId));
    expect(op!.status).toBe("succeeded");
  });
});

describe("reconcileReversalOpFromStripe", () => {
  it("transitions indeterminate_5xx → succeeded and finalises the refund + order", async () => {
    const { orderId } = await createOrderFixture({
      orderStatus: "refund_in_progress",
      holdStatus: "released",
    });

    const refundId = ulid();
    await db.insert(refunds).values({
      id: refundId,
      orderId,
      initiatedBy: (await db.select().from(orders).where(eq(orders.id, orderId)))[0]!.sellerId,
      reason: "test",
      type: "full",
      amountCents: 6000,
      platformFeeRefundedCents: 500,
      status: "pending_reversal",
      stripeRefundId: "re_prior_123",
    });

    const opId = ulid();
    await db.insert(paymentOperations).values({
      id: opId,
      orderId,
      type: "reversal",
      idempotencyKey: `reversal_${refundId}`,
      amountCents: 5500,
      status: "indeterminate_5xx",
    });

    await reconcileReversalOpFromStripe(opId, "trr_reconciled_123");

    const [op] = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.id, opId));
    expect(op!.status).toBe("succeeded");
    expect(op!.providerObjectId).toBe("trr_reconciled_123");

    const [refund] = await db
      .select()
      .from(refunds)
      .where(eq(refunds.id, refundId));
    expect(refund!.status).toBe("processed");

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("refunded");
  });
});
// ---------------------------------------------------------------------------

describe("processRefund — admin cancel options", () => {
  it("pre-release: terminal status 'cancelled', hold refunded, refund processed, payment op succeeded", async () => {
    const { orderId, holdId } = await createOrderFixture({ holdStatus: "held" });
    const adminId = ulid();
    await db.insert(user).values({
      id: adminId,
      name: "Test Admin",
      email: `admin-${adminId.toLowerCase()}@example.com`,
      emailVerified: true,
    });

    await processRefund(orderId, adminId, "admin_cancellation", {
      isAdmin: true,
      terminalOrderStatus: "cancelled",
    });

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("cancelled");

    const [refund] = await db.select().from(refunds).where(eq(refunds.orderId, orderId));
    expect(refund!.status).toBe("processed");
    expect(refund!.stripeRefundId).toBe("re_test_stripe_123");

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("refunded");

    const ops = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.orderId, orderId));
    expect(ops.length).toBe(1);
    expect(ops[0]!.status).toBe("succeeded");
  });

  it("post-release: terminal status 'cancelled' after refund + reversal both succeed", async () => {
    const { orderId } = await createOrderFixture({
      orderStatus: "delivered",
      holdStatus: "released",
    });
    const adminId = ulid();
    await db.insert(user).values({
      id: adminId,
      name: "Test Admin",
      email: `admin-${adminId.toLowerCase()}@example.com`,
      emailVerified: true,
    });

    await processRefund(orderId, adminId, "admin_cancellation", {
      isAdmin: true,
      terminalOrderStatus: "cancelled",
    });

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("cancelled");

    const ops = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.orderId, orderId));
    expect(ops.length).toBe(2);
    expect(ops.every((o) => o.status === "succeeded")).toBe(true);
  });

  it("pre-release: Stripe refund failure leaves order/hold untouched and surfaces error", async () => {
    const { orderId, holdId } = await createOrderFixture({ holdStatus: "held" });
    const adminId = ulid();
    await db.insert(user).values({
      id: adminId,
      name: "Test Admin",
      email: `admin2-${adminId.toLowerCase()}@example.com`,
      emailVerified: true,
    });

    // Override the Stripe refund mock to fail
    vi.mocked(getStripe).mockReturnValue({
      refunds: {
        create: vi.fn().mockRejectedValue(new Error("stripe boom")),
      },
      transfers: {
        createReversal: vi.fn(),
      },
    } as unknown as ReturnType<typeof getStripe>);

    await expect(
      processRefund(orderId, adminId, "admin_cancellation", {
        isAdmin: true,
        terminalOrderStatus: "cancelled",
      }),
    ).rejects.toThrow(/stripe boom/);

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("paid"); // unchanged

    const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
    expect(hold!.status).toBe("held"); // unchanged

    const [refund] = await db.select().from(refunds).where(eq(refunds.orderId, orderId));
    expect(refund!.status).toBe("failed");
  });

  it("isAdmin bypasses the seller-only authz check; non-admin actor without isAdmin throws Forbidden", async () => {
    const { orderId } = await createOrderFixture({ holdStatus: "held" });
    const otherId = ulid();
    await db.insert(user).values({
      id: otherId,
      name: "Other",
      email: `other-${otherId.toLowerCase()}@example.com`,
      emailVerified: true,
    });

    // Without isAdmin, a non-seller actor should be rejected at the service layer
    await expect(
      processRefund(orderId, otherId, "noop"),
    ).rejects.toThrow(ForbiddenError);

    // With isAdmin, the same non-seller actor succeeds
    await processRefund(orderId, otherId, "admin_cancellation", {
      isAdmin: true,
      terminalOrderStatus: "cancelled",
    });

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("cancelled");
  });

  it("seller-initiated default: still terminates as 'refunded' (regression guard)", async () => {
    const { orderId, sellerId } = await createOrderFixture({ holdStatus: "held" });

    await processRefund(orderId, sellerId, "buyer request");

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("refunded");
  });
});

// ---------------------------------------------------------------------------
// LB-R2-1 — widen retry gate on non-terminal payment_operations
// ---------------------------------------------------------------------------

describe("processRefund — LB-R2-1 non-terminal payment_operations gate", () => {
  it("throws ConflictError (409) when an indeterminate_5xx op exists for the same PaymentIntent", async () => {
    const { orderId } = await createOrderFixture({ holdStatus: "held" });

    // Insert an indeterminate_5xx refund op for this order
    const staleOpId = ulid();
    await db.insert(paymentOperations).values({
      id: staleOpId,
      orderId,
      type: "refund",
      idempotencyKey: `refund_${ulid()}`,
      amountCents: 6000,
      status: "indeterminate_5xx",
      lastError: "503 from Stripe",
    });

    // Also insert a failed refunds row to simulate the scenario where an
    // operator manually marked the refund row as failed (the danger case).
    const staleRefundId = ulid();
    const [loadedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
    await db.insert(refunds).values({
      id: staleRefundId,
      orderId,
      initiatedBy: loadedOrder!.sellerId,
      reason: "prior attempt",
      type: "full",
      amountCents: 6000,
      platformFeeRefundedCents: 500,
      status: "failed",
    });

    await expect(
      processRefund(orderId, loadedOrder!.sellerId, "retry attempt"),
    ).rejects.toThrow(ConflictError);

    await expect(
      processRefund(orderId, loadedOrder!.sellerId, "retry attempt"),
    ).rejects.toThrow(/prior refund operation.*unresolved/i);
  });

  it("throws ConflictError (409) when a pending op exists for the same PaymentIntent", async () => {
    const { orderId } = await createOrderFixture({ holdStatus: "held" });

    const pendingOpId = ulid();
    await db.insert(paymentOperations).values({
      id: pendingOpId,
      orderId,
      type: "refund",
      idempotencyKey: `refund_${ulid()}`,
      amountCents: 6000,
      status: "pending",
    });

    const [loadedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));

    await expect(
      processRefund(orderId, loadedOrder!.sellerId, "retry while pending"),
    ).rejects.toThrow(ConflictError);
  });

  it("allows a new refund when only succeeded and failed ops exist (regression guard)", async () => {
    const { orderId, sellerId } = await createOrderFixture({ holdStatus: "held" });

    // Insert terminal ops only — should NOT block a fresh refund attempt
    await db.insert(paymentOperations).values([
      {
        id: ulid(),
        orderId,
        type: "refund",
        idempotencyKey: `refund_${ulid()}`,
        amountCents: 6000,
        status: "succeeded",
        providerObjectId: "re_prior_succeeded",
      },
      {
        id: ulid(),
        orderId,
        type: "refund",
        idempotencyKey: `refund_${ulid()}`,
        amountCents: 6000,
        status: "failed",
        lastError: "card declined",
      },
    ]);

    // The order is still in 'paid' state (no refund row blocking it), so a
    // fresh processRefund should proceed to Stripe without hitting the new gate.
    await expect(
      processRefund(orderId, sellerId, "legitimate retry after confirmed failures"),
    ).resolves.not.toThrow();
  });

  // LB-R2R3-2: widened gate — failed + auto_timeout_unverified BLOCKS retry
  it("throws ConflictError (409) when a failed+auto_timeout_unverified op exists (widened gate)", async () => {
    const { orderId } = await createOrderFixture({ holdStatus: "held" });

    const [loadedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));

    await db.insert(paymentOperations).values({
      id: ulid(),
      orderId,
      type: "refund",
      idempotencyKey: `refund_${ulid()}`,
      amountCents: 6000,
      status: "failed",
      lastError: "auto-timed out by cron",
      failureProvenance: "auto_timeout_unverified",
    });

    await expect(
      processRefund(orderId, loadedOrder!.sellerId, "retry after cron auto-fail"),
    ).rejects.toThrow(ConflictError);

    await expect(
      processRefund(orderId, loadedOrder!.sellerId, "retry after cron auto-fail"),
    ).rejects.toThrow(/prior refund operation.*unresolved/i);
  });

  // LB-R2R3-2: regression guard — failed + stripe_confirmed_failed does NOT block
  it("allows retry when failed op has provenance=stripe_confirmed_failed (not auto_timeout_unverified)", async () => {
    const { orderId, sellerId } = await createOrderFixture({ holdStatus: "held" });

    await db.insert(paymentOperations).values({
      id: ulid(),
      orderId,
      type: "refund",
      idempotencyKey: `refund_${ulid()}`,
      amountCents: 6000,
      status: "failed",
      lastError: "Stripe confirmed refund failed",
      failureProvenance: "stripe_confirmed_failed",
    });

    // A stripe_confirmed_failed op is a genuine terminal failure — the gate
    // must NOT block a fresh refund attempt.
    await expect(
      processRefund(orderId, sellerId, "legitimate retry after confirmed stripe failure"),
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// LB-R2-2 — reconciler ordering + SELECT FOR UPDATE serialisation
// ---------------------------------------------------------------------------

describe("LB-R2-2 reconciler ordering", () => {
  // Helper: build a full post-transfer fixture with both ops pre-inserted in
  // indeterminate_5xx so the reconcile helpers can transition them.
  async function createReversalFixture(refundStatus: "pending" | "pending_reversal" = "pending_reversal") {
    const { orderId } = await createOrderFixture({
      orderStatus: "refund_in_progress",
      holdStatus: "released",
    });

    const [loadedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));

    const refundId = ulid();
    await db.insert(refunds).values({
      id: refundId,
      orderId,
      initiatedBy: loadedOrder!.sellerId,
      reason: "test",
      type: "full",
      amountCents: 6000,
      platformFeeRefundedCents: 500,
      status: refundStatus,
      stripeRefundId: refundStatus === "pending_reversal" ? "re_prior_123" : null,
    });

    const refundOpId = ulid();
    await db.insert(paymentOperations).values({
      id: refundOpId,
      orderId,
      type: "refund",
      idempotencyKey: `refund_${refundId}`,
      amountCents: 6000,
      status: refundStatus === "pending_reversal" ? "succeeded" : "indeterminate_5xx",
      providerObjectId: refundStatus === "pending_reversal" ? "re_prior_123" : null,
      lastError: refundStatus === "pending_reversal" ? null : "503",
    });

    const reversalOpId = ulid();
    await db.insert(paymentOperations).values({
      id: reversalOpId,
      orderId,
      type: "reversal",
      idempotencyKey: `reversal_${refundId}`,
      amountCents: 5500,
      status: "indeterminate_5xx",
      lastError: "503",
    });

    return { orderId, refundId, refundOpId, reversalOpId };
  }

  it("reversal-first: reversal webhook fires while refund row is still pending → order stays refund_in_progress, refund stays pending, reversal op → succeeded", async () => {
    const { orderId, reversalOpId, refundId } = await createReversalFixture("pending");

    await reconcileReversalOpFromStripe(reversalOpId, "trr_reversal_first_123");

    // Reversal op should be succeeded (CAS succeeded)
    const [reversalOp] = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.id, reversalOpId));
    expect(reversalOp!.status).toBe("succeeded");
    expect(reversalOp!.providerObjectId).toBe("trr_reversal_first_123");

    // Order must NOT have been finalised — deferred to refund webhook
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("refund_in_progress");

    // Refund row must remain pending
    const [refund] = await db.select().from(refunds).where(eq(refunds.id, refundId));
    expect(refund!.status).toBe("pending");
  });

  it("reversal-first (cont.): subsequent refund webhook finalises both rows to terminal state", async () => {
    const { orderId, reversalOpId, refundOpId, refundId } = await createReversalFixture("pending");

    // Step 1 — reversal webhook fires first (defers)
    await reconcileReversalOpFromStripe(reversalOpId, "trr_reversal_first_456");

    // Step 2 — refund webhook arrives
    await reconcileRefundOpFromStripe(refundOpId, "re_refund_second_456");

    // Both rows must be terminal
    const [refund] = await db.select().from(refunds).where(eq(refunds.id, refundId));
    expect(refund!.status).toBe("processed");

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("refunded");
  });

  it("refund-first (normal case): refund webhook fires first → terminal state reached", async () => {
    const { orderId, refundOpId, refundId } = await createReversalFixture("pending");

    // Refund webhook fires first — reversal op is still indeterminate_5xx,
    // so reconcileRefundOpFromStripe should mark refund as pending_reversal
    // and leave the order in refund_in_progress for the reversal webhook.
    await reconcileRefundOpFromStripe(refundOpId, "re_refund_first_789");

    // Refund row should be pending_reversal (not processed) — reversal still outstanding
    const [refundMid] = await db.select().from(refunds).where(eq(refunds.id, refundId));
    expect(refundMid!.status).toBe("pending_reversal");

    const [orderMid] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(orderMid!.status).toBe("refund_in_progress");

    // Now reversal webhook fires
    const [reversalOp] = await db
      .select()
      .from(paymentOperations)
      .where(
        and(
          eq(paymentOperations.orderId, orderId),
          eq(paymentOperations.type, "reversal"),
        ),
      )
      .limit(1);

    await reconcileReversalOpFromStripe(reversalOp!.id, "trr_reversal_second_789");

    const [refundFinal] = await db.select().from(refunds).where(eq(refunds.id, refundId));
    expect(refundFinal!.status).toBe("processed");

    const [orderFinal] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(orderFinal!.status).toBe("refunded");
  });

  it("duplicate webhook delivery: calling same reconciler twice is a no-op (CAS idempotency)", async () => {
    const { orderId, reversalOpId } = await createReversalFixture("pending_reversal");

    // First call — normal reconciliation
    await reconcileReversalOpFromStripe(reversalOpId, "trr_dup_123");

    // Second call — CAS should short-circuit silently
    await expect(
      reconcileReversalOpFromStripe(reversalOpId, "trr_dup_123"),
    ).resolves.not.toThrow();

    const [op] = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.id, reversalOpId));
    expect(op!.status).toBe("succeeded");

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("refunded");
  });

  it("CONCURRENT race: both reconcilers fired in parallel → deterministic terminal state (exercises real Postgres row locking)", async () => {
    // Both ops start indeterminate_5xx; both webhooks arrive simultaneously.
    // The SELECT FOR UPDATE on the orders row ensures only one reconciler
    // drives the terminal transition — the other reads post-commit state.
    const { orderId, refundOpId, reversalOpId, refundId } = await createReversalFixture("pending");

    await Promise.all([
      reconcileReversalOpFromStripe(reversalOpId, "trr_concurrent_123"),
      reconcileRefundOpFromStripe(refundOpId, "re_concurrent_123"),
    ]);

    // Regardless of which handler ran first, end state must be deterministic
    const [refund] = await db.select().from(refunds).where(eq(refunds.id, refundId));
    expect(refund!.status).toBe("processed");

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("refunded");

    // Both ops must be succeeded
    const ops = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.orderId, orderId));
    const refundOp = ops.find((o) => o.type === "refund");
    const reversalOp = ops.find((o) => o.type === "reversal");
    expect(refundOp!.status).toBe("succeeded");
    expect(reversalOp!.status).toBe("succeeded");
  });
});

// ---------------------------------------------------------------------------
// LB-R2R3-2 late-webhook resurrection
// ---------------------------------------------------------------------------

vi.mock("./admin-alerts.js", () => ({
  enqueueAdminAlert: vi.fn().mockResolvedValue(undefined),
}));

describe("LB-R2R3-2 late-webhook resurrection", () => {
  it("cron auto-fails op → new refund attempt → 409 → operator force-fails as operator_verified_absent → new attempt allowed", async () => {
    const { orderId, sellerId } = await createOrderFixture({ holdStatus: "held" });

    // Cron auto-failed the op with auto_timeout_unverified provenance
    const cronFailedOpId = ulid();
    await db.insert(paymentOperations).values({
      id: cronFailedOpId,
      orderId,
      type: "refund",
      idempotencyKey: `refund_${ulid()}`,
      amountCents: 6000,
      status: "failed",
      lastError: "auto-timed out by cron",
      failureProvenance: "auto_timeout_unverified",
    });

    // New refund attempt should be blocked by the widened gate
    await expect(
      processRefund(orderId, sellerId, "retry after cron auto-fail"),
    ).rejects.toThrow(ConflictError);

    // Operator investigates, determines Stripe never processed it, force-fails
    // with operator_verified_absent provenance.
    await db
      .update(paymentOperations)
      .set({
        status: "failed",
        failureProvenance: "operator_verified_absent",
        lastError: "operator confirmed Stripe never processed this",
      })
      .where(eq(paymentOperations.id, cronFailedOpId));

    // Now the gate should pass — operator_verified_absent is NOT blocked
    await expect(
      processRefund(orderId, sellerId, "retry after operator force-fail"),
    ).resolves.not.toThrow();
  });

  it("cron auto-fails → late webhook with success → resurrects op + finalises order", async () => {
    // Setup: op failed+auto_timeout_unverified, refund pending, order refund_in_progress
    const { orderId } = await createOrderFixture({
      orderStatus: "refund_in_progress",
      holdStatus: "held",
    });

    const [loadedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
    const refundId = ulid();
    await db.insert(refunds).values({
      id: refundId,
      orderId,
      initiatedBy: loadedOrder!.sellerId,
      reason: "test resurrection",
      type: "full",
      amountCents: 6000,
      platformFeeRefundedCents: 500,
      status: "pending",
    });

    const opId = ulid();
    await db.insert(paymentOperations).values({
      id: opId,
      orderId,
      type: "refund",
      idempotencyKey: `refund_${refundId}`,
      amountCents: 6000,
      status: "failed",
      lastError: "auto-timed out by cron",
      failureProvenance: "auto_timeout_unverified",
    });

    // Late webhook fires — Stripe confirms success
    await reconcileRefundOpFromStripe(opId, "re_late_webhook_123");

    // Op must be succeeded with resurrectedAt set
    const [op] = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.id, opId));
    expect(op!.status).toBe("succeeded");
    expect(op!.providerObjectId).toBe("re_late_webhook_123");
    expect(op!.resurrectedAt).not.toBeNull();

    // Refund must be processed
    const [refund] = await db.select().from(refunds).where(eq(refunds.id, refundId));
    expect(refund!.status).toBe("processed");
    expect(refund!.stripeRefundId).toBe("re_late_webhook_123");

    // Order must be refunded
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("refunded");

    // Admin alert should have been fired
    expect(enqueueAdminAlert).toHaveBeenCalledWith(
      expect.objectContaining({ type: "resurrected_auto_failed_op", opId }),
    );
  });

  it("failed+stripe_confirmed_failed → late webhook arrives → no resurrection (CAS fails)", async () => {
    const { orderId } = await createOrderFixture({
      orderStatus: "refund_in_progress",
      holdStatus: "held",
    });

    const [loadedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
    const refundId = ulid();
    await db.insert(refunds).values({
      id: refundId,
      orderId,
      initiatedBy: loadedOrder!.sellerId,
      reason: "test",
      type: "full",
      amountCents: 6000,
      platformFeeRefundedCents: 500,
      status: "pending",
    });

    const opId = ulid();
    await db.insert(paymentOperations).values({
      id: opId,
      orderId,
      type: "refund",
      idempotencyKey: `refund_${refundId}`,
      amountCents: 6000,
      status: "failed",
      lastError: "Stripe confirmed refund failed",
      failureProvenance: "stripe_confirmed_failed",
    });

    vi.mocked(enqueueAdminAlert).mockClear();

    // Late webhook arrives claiming success — should NOT resurrect
    await expect(
      reconcileRefundOpFromStripe(opId, "re_late_should_be_ignored"),
    ).resolves.not.toThrow();

    // Op must stay failed + stripe_confirmed_failed (no state changes)
    const [op] = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.id, opId));
    expect(op!.status).toBe("failed");
    expect(op!.failureProvenance).toBe("stripe_confirmed_failed");

    // Refund must not have changed
    const [refund] = await db.select().from(refunds).where(eq(refunds.id, refundId));
    expect(refund!.status).toBe("pending");

    // Order must not have changed
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("refund_in_progress");

    // No admin alert for stripe_confirmed_failed (it's a genuine failure)
    expect(enqueueAdminAlert).not.toHaveBeenCalled();
  });

  it("failed+operator_verified_absent → late webhook arrives → no resurrection, no admin alert", async () => {
    const { orderId } = await createOrderFixture({
      orderStatus: "refund_in_progress",
      holdStatus: "held",
    });

    const [loadedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
    const refundId = ulid();
    await db.insert(refunds).values({
      id: refundId,
      orderId,
      initiatedBy: loadedOrder!.sellerId,
      reason: "test",
      type: "full",
      amountCents: 6000,
      platformFeeRefundedCents: 500,
      status: "pending",
    });

    const opId = ulid();
    await db.insert(paymentOperations).values({
      id: opId,
      orderId,
      type: "refund",
      idempotencyKey: `refund_${refundId}`,
      amountCents: 6000,
      status: "failed",
      lastError: "operator confirmed absent",
      failureProvenance: "operator_verified_absent",
    });

    vi.mocked(enqueueAdminAlert).mockClear();

    // Late webhook arrives — should NOT resurrect operator_verified_absent
    await expect(
      reconcileRefundOpFromStripe(opId, "re_operator_absent_late"),
    ).resolves.not.toThrow();

    // Op must stay failed + operator_verified_absent
    const [op] = await db
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.id, opId));
    expect(op!.status).toBe("failed");
    expect(op!.failureProvenance).toBe("operator_verified_absent");

    // Refund must not have changed
    const [refund] = await db.select().from(refunds).where(eq(refunds.id, refundId));
    expect(refund!.status).toBe("pending");

    // Order must not have changed
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("refund_in_progress");

    // No resurrection alert — op was operator-verified absent (it's a real failure)
    expect(enqueueAdminAlert).not.toHaveBeenCalled();
  });
});
