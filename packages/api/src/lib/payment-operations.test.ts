import { describe, it, expect } from "vitest";
import { ulid } from "ulid";
import { db } from "@bushpop/db/client";
import { eq, sql } from "drizzle-orm";
import { paymentOperations, orders, checkoutSessions, carts } from "@bushpop/db/schema";
import { createTestUser } from "../test/helpers/create-user.js";
import { getPikloChannel } from "../test/helpers/get-channel.js";
import {
  createPaymentOp,
  succeedPaymentOp,
  failPaymentOp,
  findPendingOps,
  succeedAutoFailedOp,
} from "./payment-operations.js";

// ---------------------------------------------------------------------------
// Fixture helpers (called inside test bodies, after beforeEach truncation)
// ---------------------------------------------------------------------------

async function createTestOrder(): Promise<string> {
  const channel = await getPikloChannel();
  const buyer = await createTestUser();
  const seller = await createTestUser();

  const [cart] = await db
    .insert(carts)
    .values({ id: ulid(), buyerId: buyer.id, channelId: channel.id })
    .returning();

  const [cs] = await db
    .insert(checkoutSessions)
    .values({
      id: ulid(),
      cartId: cart!.id,
      buyerId: buyer.id,
      channelId: channel.id,
      status: "succeeded",
      subtotalCents: 5000,
      shippingCents: 1000,
      platformFeeCents: 500,
      sellerProceedsCents: 5500,
      totalCents: 6000,
      currency: "AUD",
    })
    .returning();

  const [order] = await db
    .insert(orders)
    .values({
      id: ulid(),
      checkoutSessionId: cs!.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      channelId: channel.id,
      status: "paid",
      subtotalCents: 5000,
      shippingCents: 1000,
      platformFeeCents: 500,
      sellerProceedsCents: 5500,
      totalCents: 6000,
      currency: "AUD",
      stripePaymentIntentId: "pi_test_123",
    })
    .returning();

  return order!.id;
}

// ---------------------------------------------------------------------------
// createPaymentOp
// ---------------------------------------------------------------------------

describe("createPaymentOp", () => {
  it("returns row with status=pending and correct fields", async () => {
    const orderId = await createTestOrder();
    const op = await createPaymentOp(orderId, "refund", "refund_key_001", 6000);

    expect(op.orderId).toBe(orderId);
    expect(op.type).toBe("refund");
    expect(op.idempotencyKey).toBe("refund_key_001");
    expect(op.amountCents).toBe(6000);
    expect(op.status).toBe("pending");
    expect(op.id).toHaveLength(26);
    expect(op.providerObjectId).toBeNull();
    expect(op.lastError).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// succeedPaymentOp
// ---------------------------------------------------------------------------

describe("succeedPaymentOp", () => {
  it("updates status to succeeded and sets providerObjectId", async () => {
    const orderId = await createTestOrder();
    const created = await createPaymentOp(orderId, "refund", "refund_key_002", 6000);
    const updated = await succeedPaymentOp(created.id, "re_stripe_123");

    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(created.id);
    expect(updated!.status).toBe("succeeded");
    expect(updated!.providerObjectId).toBe("re_stripe_123");
  });
});

// ---------------------------------------------------------------------------
// failPaymentOp
// ---------------------------------------------------------------------------

describe("failPaymentOp", () => {
  it("updates status to failed and sets lastError", async () => {
    const orderId = await createTestOrder();
    const created = await createPaymentOp(orderId, "refund", "refund_key_003", 6000);
    const updated = await failPaymentOp(created.id, "Card declined");

    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(created.id);
    expect(updated!.status).toBe("failed");
    expect(updated!.lastError).toBe("Card declined");
  });
});

// ---------------------------------------------------------------------------
// findPendingOps
// ---------------------------------------------------------------------------

describe("findPendingOps", () => {
  it("returns only pending rows older than the threshold", async () => {
    const orderId = await createTestOrder();

    // Insert a fresh pending op (created now — too new to be returned)
    await createPaymentOp(orderId, "refund", "refund_fresh", 6000);

    // Insert a stale pending op, then backdate it to 10 minutes ago
    const staleId = ulid();
    await db.insert(paymentOperations).values({
      id: staleId,
      orderId,
      type: "refund",
      idempotencyKey: "refund_stale",
      amountCents: 6000,
      status: "pending",
    });
    await db.execute(sql`
      UPDATE payment_operations
      SET created_at = now() - interval '10 minutes'
      WHERE id = ${staleId}
    `);

    const results = await findPendingOps(5);

    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe(staleId);
    expect(results[0]!.idempotencyKey).toBe("refund_stale");
  });

  it("excludes succeeded and failed rows", async () => {
    const orderId = await createTestOrder();

    // Insert an op, backdate it, then mark it succeeded
    const op = await createPaymentOp(orderId, "refund", "refund_done", 6000);
    await db.execute(sql`
      UPDATE payment_operations
      SET created_at = now() - interval '10 minutes'
      WHERE id = ${op.id}
    `);
    await succeedPaymentOp(op.id, "re_stripe_456");

    const results = await findPendingOps(5);
    expect(results.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// succeedAutoFailedOp — LB-R2R3-2 CAS resurrection variant
// ---------------------------------------------------------------------------

describe("succeedAutoFailedOp", () => {
  it("resurrects a failed+auto_timeout_unverified op: sets succeeded, providerObjectId, resurrectedAt", async () => {
    const orderId = await createTestOrder();

    // Insert a failed op with auto_timeout_unverified provenance
    const opId = ulid();
    await db.insert(paymentOperations).values({
      id: opId,
      orderId,
      type: "refund",
      idempotencyKey: `refund_${ulid()}`,
      amountCents: 6000,
      status: "failed",
      lastError: "auto-timed out by cron",
      failureProvenance: "auto_timeout_unverified",
    });

    const result = await succeedAutoFailedOp(opId, "re_late_webhook_123");

    expect(result).not.toBeNull();
    expect(result!.id).toBe(opId);
    expect(result!.status).toBe("succeeded");
    expect(result!.providerObjectId).toBe("re_late_webhook_123");

    // Verify resurrected_at was set in the DB (not in the PaymentOperation type yet)
    const [row] = await db
      .select({ resurrectedAt: paymentOperations.resurrectedAt })
      .from(paymentOperations)
      .where(eq(paymentOperations.id, opId));
    expect(row!.resurrectedAt).not.toBeNull();
  });

  it("returns null for failed+stripe_confirmed_failed op (CAS predicate not met)", async () => {
    const orderId = await createTestOrder();

    const opId = ulid();
    await db.insert(paymentOperations).values({
      id: opId,
      orderId,
      type: "refund",
      idempotencyKey: `refund_${ulid()}`,
      amountCents: 6000,
      status: "failed",
      lastError: "Stripe confirmed absent",
      failureProvenance: "stripe_confirmed_failed",
    });

    const result = await succeedAutoFailedOp(opId, "re_should_not_update");

    expect(result).toBeNull();

    // Op must be unchanged
    const [row] = await db
      .select({ status: paymentOperations.status })
      .from(paymentOperations)
      .where(eq(paymentOperations.id, opId));
    expect(row!.status).toBe("failed");
  });

  it("returns null for failed+operator_verified_absent op (CAS predicate not met)", async () => {
    const orderId = await createTestOrder();

    const opId = ulid();
    await db.insert(paymentOperations).values({
      id: opId,
      orderId,
      type: "refund",
      idempotencyKey: `refund_${ulid()}`,
      amountCents: 6000,
      status: "failed",
      lastError: "Operator confirmed absent",
      failureProvenance: "operator_verified_absent",
    });

    const result = await succeedAutoFailedOp(opId, "re_should_not_update");

    expect(result).toBeNull();

    const [row] = await db
      .select({ status: paymentOperations.status })
      .from(paymentOperations)
      .where(eq(paymentOperations.id, opId));
    expect(row!.status).toBe("failed");
  });

  it("returns null for already-succeeded op (CAS predicate not met)", async () => {
    const orderId = await createTestOrder();

    const created = await createPaymentOp(orderId, "refund", `refund_${ulid()}`, 6000);
    await succeedPaymentOp(created.id, "re_already_succeeded");

    const result = await succeedAutoFailedOp(created.id, "re_should_not_update");

    expect(result).toBeNull();

    const [row] = await db
      .select({ status: paymentOperations.status, providerObjectId: paymentOperations.providerObjectId })
      .from(paymentOperations)
      .where(eq(paymentOperations.id, created.id));
    expect(row!.status).toBe("succeeded");
    expect(row!.providerObjectId).toBe("re_already_succeeded");
  });
});
