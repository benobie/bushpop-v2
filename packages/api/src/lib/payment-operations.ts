import { eq, and, like, desc, sql, inArray } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { paymentOperations } from "@bushpop/db/schema";
import type { PaymentOperation, PaymentOperationType } from "@bushpop/types";

/** A drizzle transaction client (or the base `db`). */
type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Payment Operations WAL — write-ahead log for all Stripe calls
// ---------------------------------------------------------------------------

/**
 * Create a new pending payment operation row.
 *
 * Called BEFORE the Stripe API call as the first leg of the WAL pattern.
 *
 * ADR-015 Sprint 1b W1: accepts an optional `orderGroupId` for operations that
 * belong to a multi-vendor order_group. Single-seller (legacy) callers pass
 * only `orderId`; multi-vendor callers (W2+) pass both.
 */
export async function createPaymentOp(
  orderId: string | null,
  type: PaymentOperationType,
  idempotencyKey: string,
  amountCents: number,
  orderGroupId?: string,
): Promise<PaymentOperation> {
  const [row] = await db
    .insert(paymentOperations)
    .values({
      orderId,
      orderGroupId: orderGroupId ?? null,
      type,
      idempotencyKey,
      amountCents,
      status: "pending",
    })
    .returning();

  return row as PaymentOperation;
}

/**
 * Mark a payment operation as succeeded, recording the Stripe object ID.
 *
 * Called AFTER a successful Stripe API call.
 */
export async function succeedPaymentOp(
  id: string,
  providerObjectId: string,
  tx?: DbClient,
): Promise<PaymentOperation | null> {
  const client = tx ?? db;
  const rows = await client
    .update(paymentOperations)
    .set({ status: "succeeded", providerObjectId })
    .where(and(eq(paymentOperations.id, id), eq(paymentOperations.status, "pending")))
    .returning();

  // If 0 rows, the op was already transitioned — treat as no-op
  return (rows[0] ?? null) as PaymentOperation | null;
}

/**
 * Mark a payment operation as failed, recording the error message.
 *
 * Called when a Stripe API call throws or returns an error.
 */
export async function failPaymentOp(
  id: string,
  lastError: string,
): Promise<PaymentOperation | null> {
  const rows = await db
    .update(paymentOperations)
    .set({ status: "failed", lastError })
    .where(and(eq(paymentOperations.id, id), eq(paymentOperations.status, "pending")))
    .returning();

  // If 0 rows, the op was already transitioned — treat as no-op
  return (rows[0] ?? null) as PaymentOperation | null;
}

/**
 * Mark a payment operation as indeterminate after a Stripe 5xx response.
 *
 * Per Stripe docs (research-283), a 5xx error means the side effect is
 * indeterminate: the request may have succeeded, may have failed, or may
 * have been cached under the idempotency key (24h TTL). Retrying with the
 * same key returns the cached 5xx; retrying with a new key risks a double
 * side effect. The correct recovery is out-of-band reconciliation via
 * webhooks or the daily reconciliation job.
 *
 * This status is intentionally distinct from both `pending` (which
 * `resumePendingRefunds` will replay) and `failed` (which is a terminal
 * failure). LB-3 / R1.
 */
export async function markIndeterminate5xx(
  id: string,
  lastError: string,
): Promise<PaymentOperation | null> {
  const rows = await db
    .update(paymentOperations)
    .set({ status: "indeterminate_5xx", lastError })
    .where(and(eq(paymentOperations.id, id), eq(paymentOperations.status, "pending")))
    .returning();

  return (rows[0] ?? null) as PaymentOperation | null;
}

/**
 * Transition an indeterminate_5xx op to succeeded once out-of-band
 * reconciliation (webhook or daily job) has confirmed the Stripe side
 * effect landed.
 *
 * CAS-guarded on `status = 'indeterminate_5xx'` — repeated webhook
 * deliveries return 0 rows and the caller should short-circuit.
 */
export async function succeedIndeterminateOp(
  id: string,
  providerObjectId: string,
  tx?: DbClient,
): Promise<PaymentOperation | null> {
  const client = tx ?? db;
  const rows = await client
    .update(paymentOperations)
    .set({ status: "succeeded", providerObjectId })
    .where(
      and(
        eq(paymentOperations.id, id),
        eq(paymentOperations.status, "indeterminate_5xx"),
      ),
    )
    .returning();

  return (rows[0] ?? null) as PaymentOperation | null;
}

/**
 * Transition a `failed + auto_timeout_unverified` op to succeeded when a late
 * webhook arrives confirming the Stripe side effect actually landed.
 *
 * CAS-guarded on both `status = 'failed'` AND
 * `failure_provenance = 'auto_timeout_unverified'` — ops in
 * `stripe_confirmed_failed` or `operator_verified_absent` are genuine failures
 * and MUST NOT be resurrected. Returns null if the CAS predicate is not met
 * (no-op, idempotent).
 *
 * Sets `resurrected_at` for audit trail.
 *
 * Pre-requisite for Task 7 (late-webhook resurrection branch). LB-R2R3-2.
 */
export async function succeedAutoFailedOp(
  id: string,
  providerObjectId: string,
): Promise<PaymentOperation | null> {
  const rows = await db
    .update(paymentOperations)
    .set({
      status: "succeeded",
      providerObjectId,
      resurrectedAt: new Date(),
    })
    .where(
      and(
        eq(paymentOperations.id, id),
        eq(paymentOperations.status, "failed"),
        eq(paymentOperations.failureProvenance, "auto_timeout_unverified"),
      ),
    )
    .returning();

  return (rows[0] ?? null) as PaymentOperation | null;
}

/**
 * Find payment operations stuck in `indeterminate_5xx` older than
 * `minAgeMinutes`. Used by the daily reconciliation job (LB-3 / LB-2).
 */
export async function findIndeterminateOps(
  minAgeMinutes: number = 60,
): Promise<PaymentOperation[]> {
  const rows = await db
    .select()
    .from(paymentOperations)
    .where(
      and(
        eq(paymentOperations.status, "indeterminate_5xx"),
        sql`${paymentOperations.createdAt} < now() - (${minAgeMinutes} * interval '1 minute')`,
      ),
    );

  return rows as PaymentOperation[];
}

/**
 * Find payment operations that are still in `pending` status and are older
 * than `minAgeMinutes` minutes.
 *
 * Used by crash recovery to resume interrupted Stripe flows.
 *
 * @param minAgeMinutes - Minimum age in minutes before a pending op is
 *   considered stale and eligible for recovery (default: 5).
 */
export async function findPendingOps(
  minAgeMinutes: number = 5,
): Promise<PaymentOperation[]> {
  const rows = await db
    .select()
    .from(paymentOperations)
    .where(
      and(
        eq(paymentOperations.status, "pending"),
        sql`${paymentOperations.createdAt} < now() - (${minAgeMinutes} * interval '1 minute')`,
      ),
    );

  return rows as PaymentOperation[];
}

/**
 * Find the most recent `transfer`-type payment operation for a payout hold.
 *
 * Transfer ops use a per-attempt idempotency key `${holdId}:${attempt}`, so
 * all attempts for a hold share the `${holdId}:` prefix. Used by the payout
 * release core to detect a prior `indeterminate_5xx` attempt (which triggers
 * the List-first guard) and to compute the next attempt number.
 */
export async function findLatestTransferOpForHold(
  holdId: string,
): Promise<PaymentOperation | null> {
  const [row] = await db
    .select()
    .from(paymentOperations)
    .where(
      and(
        eq(paymentOperations.type, "transfer"),
        like(paymentOperations.idempotencyKey, `${holdId}:%`),
      ),
    )
    .orderBy(desc(paymentOperations.createdAt))
    .limit(1);

  return (row ?? null) as PaymentOperation | null;
}

/**
 * Find stale `transfer`-type payment operations still in `pending` or
 * `indeterminate_5xx` older than `minAgeMinutes`. Consumed by the
 * transfer-pending reconcile sweep (List-first, never blind same-key recreate).
 */
export async function findStaleTransferOps(
  minAgeMinutes: number = 10,
): Promise<PaymentOperation[]> {
  const rows = await db
    .select()
    .from(paymentOperations)
    .where(
      and(
        eq(paymentOperations.type, "transfer"),
        inArray(paymentOperations.status, ["pending", "indeterminate_5xx"]),
        sql`${paymentOperations.createdAt} < now() - (${minAgeMinutes} * interval '1 minute')`,
      ),
    );

  return rows as PaymentOperation[];
}
