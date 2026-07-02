import { eq, and, inArray, or, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  orders,
  refunds,
  payoutHolds,
  orderItems,
  channelListings,
  inventoryItems,
  paymentOperations,
} from "@bushpop/db/schema";
import type { PayoutHoldStatus } from "@bushpop/types";
import { ConflictError, ForbiddenError, NotFoundError } from "./errors.js";
import { ORDER_STATUS_MACHINE } from "./commerce-machines.js";
import { transitionPayoutHold } from "./payout-hold-service.js";
import { getStripe } from "./stripe.js";
import {
  createPaymentOp,
  succeedPaymentOp,
  failPaymentOp,
  findPendingOps,
  markIndeterminate5xx,
  succeedIndeterminateOp,
  succeedAutoFailedOp,
} from "./payment-operations.js";
import { enqueueEmail } from "../workers/email.js";
import { enqueueAdminAlert } from "./admin-alerts.js";

// ---------------------------------------------------------------------------
// LB-3 (R1) — Stripe 5xx indeterminacy handling
// ---------------------------------------------------------------------------

/**
 * Thrown when a Stripe call returns a 5xx / network-level error. Per Stripe
 * docs, the side effect is indeterminate — the WAL op is transitioned to
 * `indeterminate_5xx` and the caller MUST short-circuit (no downstream DB
 * writes, no rethrow into the `failed` path).
 */
export class IndeterminateStripeError extends Error {
  readonly opId: string;
  constructor(opId: string, message: string) {
    super(`Stripe 5xx on payment_op ${opId}: ${message}`);
    this.name = "IndeterminateStripeError";
    this.opId = opId;
  }
}

type StripeLikeError = {
  statusCode?: number;
  type?: string;
  code?: string;
  message?: string;
};

/**
 * The classification of a caught Stripe error, decoupled from any WAL-op
 * side effect. Shared by `classifyAndMarkStripeError` (refund/reversal path,
 * which marks + throws) and `releasePayoutHold` (transfer path, which needs
 * the kind to drive a CAS branch rather than throw).
 */
export type StripeErrorKind =
  /** 5xx / network — Stripe side effect is indeterminate. */
  | "indeterminate_5xx"
  /** Idempotency-key collision — operator attention, never blind retry. */
  | "idempotency_error"
  /** Platform balance insufficient — funding issue, not seller's fault. */
  | "balance_insufficient"
  /** Any other deterministic 4xx (account restricted, etc.). */
  | "deterministic_4xx";

/**
 * Pure classifier — inspects a caught Stripe error and returns its kind plus
 * a normalised message. No DB writes, no throw. Callers map the kind onto
 * their own state transitions.
 */
export function classifyStripeError(err: unknown): {
  kind: StripeErrorKind;
  message: string;
  statusCode: number | undefined;
} {
  const e = err as StripeLikeError;
  const message = e?.message ?? (err instanceof Error ? err.message : String(err));
  const statusCode = typeof e?.statusCode === "number" ? e.statusCode : undefined;
  const type = e?.type;
  const code = e?.code;

  if (statusCode !== undefined && statusCode >= 500) {
    return { kind: "indeterminate_5xx", message, statusCode };
  }
  if (type === "StripeIdempotencyError" || type === "idempotency_error") {
    return { kind: "idempotency_error", message, statusCode };
  }
  if (code === "balance_insufficient") {
    return { kind: "balance_insufficient", message, statusCode };
  }
  return { kind: "deterministic_4xx", message, statusCode };
}

/**
 * Classify a caught Stripe error and transition the WAL op accordingly.
 *
 * Returns the kind of failure so the caller can decide whether to rethrow
 * (failed) or short-circuit (indeterminate_5xx).
 *
 * - `statusCode >= 500` → `markIndeterminate5xx` and throw
 *   IndeterminateStripeError. Do NOT rethrow the original error.
 * - `type === 'StripeIdempotencyError'` / `'idempotency_error'` → `failPaymentOp`
 *   and rethrow. Cross-row collision — needs operator attention, not silent
 *   retry with a new key (Stripe explicitly advises against that).
 * - Everything else → `failPaymentOp` and rethrow (existing failed path).
 */
async function classifyAndMarkStripeError(
  opId: string,
  err: unknown,
): Promise<never> {
  const { kind, message } = classifyStripeError(err);

  if (kind === "indeterminate_5xx") {
    await markIndeterminate5xx(opId, message);
    throw new IndeterminateStripeError(opId, message);
  }

  await failPaymentOp(opId, message);
  throw err;
}

// ---------------------------------------------------------------------------
// processRefund
// ---------------------------------------------------------------------------

export interface ProcessRefundOptions {
  /**
   * When true, skip the seller-only authorisation check. Set by admin-initiated
   * cancellations and webhook-driven refunds where the actor is not the seller.
   */
  isAdmin?: boolean;
  /**
   * Terminal order status to write once Stripe operations complete.
   * - `refunded` (default) — seller-initiated refund.
   * - `cancelled` — admin cancellation; the order was never fulfilled and the
   *   listing/inventory should be restored as if the sale had not occurred.
   */
  terminalOrderStatus?: "refunded" | "cancelled";
}

/**
 * Initiates and (where possible) immediately completes a refund for an order.
 *
 * Two paths:
 *   - Pre-transfer (hold is `held` or `blocked`): buyer's card is refunded
 *     directly; no reversal needed.
 *   - Post-transfer (hold is `released`): refund + transfer reversal.
 *
 * All Stripe calls are wrapped in a payment_operations WAL row for crash
 * recovery via `resumePendingRefunds`.
 */
export async function processRefund(
  orderId: string,
  initiatedBy: string,
  reason: string,
  options: ProcessRefundOptions = {},
): Promise<void> {
  const isAdmin = options.isAdmin ?? false;
  const terminalOrderStatus = options.terminalOrderStatus ?? "refunded";
  const stripe = getStripe();

  // 1. Load order
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found.`);
  }

  // 1b. Authorisation — only the seller or an admin may initiate a refund.
  // Route-level middleware should also enforce this; this is a defence-in-depth
  // check at the service layer.
  if (!isAdmin && order.sellerId !== initiatedBy) {
    throw new ForbiddenError("Only the seller may initiate a refund for this order.");
  }

  // 2. Validate that refund_in_progress is a reachable transition
  const allowedTransitions =
    (ORDER_STATUS_MACHINE as Record<string, readonly string[]>)[order.status] ?? [];
  if (!allowedTransitions.includes("refund_in_progress")) {
    throw new ConflictError(
      `Order ${orderId} in status '${order.status}' cannot be refunded.`,
    );
  }

  // 3a. LB-R2-1: gate on non-terminal payment_operations for the PI,
  // not just on refunds.status. An indeterminate_5xx op means Stripe may have
  // processed the original call server-side; allowing a fresh refund row here
  // would mint a new idempotency key and risk a double refund even if the
  // prior refunds row was manually marked failed by an operator.
  if (order.stripePaymentIntentId) {
    const nonTerminalRefundOps = await db
      .select({
        id: paymentOperations.id,
        status: paymentOperations.status,
        failure_provenance: paymentOperations.failureProvenance,
      })
      .from(paymentOperations)
      .innerJoin(orders, eq(paymentOperations.orderId, orders.id))
      .where(
        and(
          eq(orders.stripePaymentIntentId, order.stripePaymentIntentId),
          eq(paymentOperations.type, "refund"),
          or(
            inArray(paymentOperations.status, ["pending", "indeterminate_5xx"]),
            and(
              eq(paymentOperations.status, "failed"),
              eq(paymentOperations.failureProvenance, "auto_timeout_unverified"),
            ),
          ),
        ),
      )
      .limit(1);

    if (nonTerminalRefundOps.length > 0) {
      const row = nonTerminalRefundOps[0]!;
      throw new ConflictError(
        `A prior refund operation for this PaymentIntent is still unresolved ` +
        `(status: ${row.status}, provenance: ${row.failure_provenance ?? "n/a"}). ` +
        `Resolve via adminForceFailOp before issuing a fresh refund.`,
      );
    }
  }

  // 3b. Check no active refund row exists
  const existingRefunds = await db
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(
        eq(refunds.orderId, orderId),
        inArray(refunds.status, ["pending", "pending_reversal", "processed"]),
      ),
    );

  if (existingRefunds.length > 0) {
    throw new ConflictError("Active refund already exists for this order");
  }

  // 4. Load payout hold
  const [hold] = await db
    .select()
    .from(payoutHolds)
    .where(eq(payoutHolds.orderId, orderId))
    .limit(1);

  if (!hold) {
    throw new NotFoundError(`Payout hold for order ${orderId} not found.`);
  }

  // 5. Insert refund row
  const [refund] = await db
    .insert(refunds)
    .values({
      orderId,
      initiatedBy,
      reason,
      type: "full",
      amountCents: order.totalCents,
      platformFeeRefundedCents: order.platformFeeCents,
      status: "pending",
    })
    .returning();

  const refundId = refund!.id;

  // 6. Branch on hold status
  const holdStatus = hold.status as PayoutHoldStatus;

  if (holdStatus === "held" || holdStatus === "blocked") {
    // ---------------------------------------------------------------------------
    // Pre-transfer path — refund directly from buyer's charge, no reversal needed
    // ---------------------------------------------------------------------------
    const refundOp = await createPaymentOp(
      orderId,
      "refund",
      `refund_${refundId}`,
      order.totalCents,
    );

    let stripeRefund;
    try {
      stripeRefund = await stripe.refunds.create(
        {
          payment_intent: order.stripePaymentIntentId!,
          metadata: {
            piklo_payment_op_id: refundOp.id,
            piklo_order_id: orderId,
            piklo_refund_id: refundId,
          },
        },
        { idempotencyKey: `refund_${refundId}` },
      );
    } catch (err) {
      // LB-3: 5xx → indeterminate_5xx, webhook reconciles. Others → failed.
      if (err instanceof IndeterminateStripeError) throw err;
      try {
        await classifyAndMarkStripeError(refundOp.id, err);
      } catch (classified) {
        if (classified instanceof IndeterminateStripeError) {
          // Leave refund row in `pending`; webhook will reconcile.
          throw classified;
        }
        await db
          .update(refunds)
          .set({ status: "failed" })
          .where(eq(refunds.id, refundId));
        throw classified;
      }
      // Unreachable (classify always throws), but satisfies TS
      throw err;
    }

    try {
      await succeedPaymentOp(refundOp.id, stripeRefund.id);

      // Wrap all post-Stripe DB writes atomically (Stripe call is outside the txn)
      await db.transaction(async (tx) => {
        // Update refund to processed
        await tx
          .update(refunds)
          .set({ status: "processed", stripeRefundId: stripeRefund.id })
          .where(eq(refunds.id, refundId));

        // Transition order → terminal status (refunded for seller refunds,
        // cancelled for admin cancellations) — direct from paid/shipped/etc.
        await tx
          .update(orders)
          .set({ status: terminalOrderStatus })
          .where(and(eq(orders.id, orderId), eq(orders.status, order.status)));

        // Transition payout hold → refunded
        // For `blocked` holds (seller account issues), transitionPayoutHold would
        // reject the transition since `blocked` is terminal in the state machine.
        // Use a direct update for those.
        if (holdStatus === "held") {
          await transitionPayoutHold(hold.id, holdStatus, "refunded", hold.version, undefined, tx);
        } else {
          // blocked — direct update (bypasses state machine, system-only refund path)
          await tx
            .update(payoutHolds)
            .set({ status: "refunded" })
            .where(eq(payoutHolds.id, hold.id));
        }

        // Restore inventory
        await restoreInventory(orderId, tx);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await failPaymentOp(refundOp.id, message);
      await db
        .update(refunds)
        .set({ status: "failed" })
        .where(eq(refunds.id, refundId));
      throw err;
    }
  } else if (holdStatus === "released") {
    // ---------------------------------------------------------------------------
    // Post-transfer path — refund-first-then-reversal.
    //
    // Semantics: buyer is always made whole; platform absorbs reversal
    // failures (alert + future seller_debts row in R2). This shape was
    // chosen for seller-initiated refunds and is also used by admin cancel
    // (AUDIT-009 / ADR-012) via terminalOrderStatus="cancelled". The R2
    // design (ADR-014) splits this into separate primitives for seller refund
    // and admin cancel — until then, both paths share this body and only
    // differ in the terminal order status written at the end.
    // ---------------------------------------------------------------------------

    // Transition order → refund_in_progress
    await db
      .update(orders)
      .set({ status: "refund_in_progress" })
      .where(and(eq(orders.id, orderId), eq(orders.status, order.status)));

    const refundOp = await createPaymentOp(
      orderId,
      "refund",
      `refund_${refundId}`,
      order.totalCents,
    );

    // --- Stripe refund call ---
    let stripeRefund;
    try {
      stripeRefund = await stripe.refunds.create(
        {
          payment_intent: order.stripePaymentIntentId!,
          metadata: {
            piklo_payment_op_id: refundOp.id,
            piklo_order_id: orderId,
            piklo_refund_id: refundId,
          },
        },
        { idempotencyKey: `refund_${refundId}` },
      );
    } catch (err) {
      if (err instanceof IndeterminateStripeError) throw err;
      try {
        await classifyAndMarkStripeError(refundOp.id, err);
      } catch (classified) {
        if (classified instanceof IndeterminateStripeError) {
          // Webhook will reconcile. Leave refund row pending, order in
          // refund_in_progress. Do NOT mark refund failed.
          throw classified;
        }
        await db
          .update(refunds)
          .set({ status: "failed" })
          .where(eq(refunds.id, refundId));
        throw classified;
      }
      throw err;
    }

    // --- FM-8: pre-create the reversal op BEFORE marking the refund op
    // succeeded, so a crash here leaves a pending reversal row that
    // resumePendingRefunds can pick up. ---
    const reversalOp = await createPaymentOp(
      orderId,
      "reversal",
      `reversal_${refundId}`,
      hold.amountCents,
    );

    await succeedPaymentOp(refundOp.id, stripeRefund.id);

    // Update refund to pending_reversal
    await db
      .update(refunds)
      .set({ status: "pending_reversal", stripeRefundId: stripeRefund.id })
      .where(eq(refunds.id, refundId));

    // --- Stripe reversal call ---
    let reversalResult;
    try {
      reversalResult = await stripe.transfers.createReversal(
        order.stripeTransferId!,
        {
          metadata: {
            piklo_payment_op_id: reversalOp.id,
            piklo_order_id: orderId,
            piklo_refund_id: refundId,
          },
        },
        { idempotencyKey: `reversal_${refundId}` },
      );
    } catch (reversalErr) {
      if (reversalErr instanceof IndeterminateStripeError) {
        // 5xx on the reversal — webhook will reconcile. Buyer already whole.
        // Do NOT send alert email yet; webhook handler does the final DB
        // writes and surfaces alerts only if reconciliation fails.
        throw reversalErr;
      }

      try {
        await classifyAndMarkStripeError(reversalOp.id, reversalErr);
      } catch (classified) {
        if (classified instanceof IndeterminateStripeError) {
          throw classified;
        }

        // Non-5xx failure: seller insufficient balance / offboarded / etc.
        // Alert admin; buyer is whole; platform absorbs the shortfall.
        // R2 will replace this with a seller_debts row.
        await enqueueEmail({
          type: "tracking_exception_admin",
          orderId,
        }).catch((emailErr) => {
          console.error("[refund-service] Failed to enqueue alert email:", emailErr);
        });

        console.error(
          `[refund-service] Transfer reversal failed for order ${orderId}:`,
          classified instanceof Error ? classified.message : classified,
        );
        // Do NOT rethrow — the buyer refund succeeded; reversal failure is
        // a platform-level issue that requires admin intervention.
        return;
      }
      return;
    }

    await succeedPaymentOp(reversalOp.id, reversalResult.id);

    // Wrap all post-Stripe DB writes atomically (Stripe call is outside the txn)
    await db.transaction(async (tx) => {
      // Update refund to processed
      await tx
        .update(refunds)
        .set({ status: "processed" })
        .where(eq(refunds.id, refundId));

      // Transition order → terminal status (refunded or cancelled) with CAS
      // guard (C2) from the refund_in_progress intermediate state.
      const updated = await tx
        .update(orders)
        .set({ status: terminalOrderStatus })
        .where(and(eq(orders.id, orderId), eq(orders.status, "refund_in_progress")))
        .returning({ id: orders.id });
      if (updated.length === 0) {
        throw new ConflictError("Order status changed concurrently");
      }

      // Restore inventory
      await restoreInventory(orderId, tx);
    });
  } else {
    throw new ConflictError(
      `Payout hold for order ${orderId} is in status '${holdStatus}' — cannot refund.`,
    );
  }
}

// ---------------------------------------------------------------------------
// resumePendingRefunds (crash recovery)
// ---------------------------------------------------------------------------

/**
 * Scans for stale pending payment operations (older than 5 min) and resumes
 * interrupted refund flows.
 *
 * Called on worker start to recover from crashes mid-Stripe-call.
 *
 * LB-3: `findPendingOps` filters by `status = 'pending'`, so ops in
 * `indeterminate_5xx` are intentionally excluded — they require webhook /
 * daily-job reconciliation rather than same-key replay (which would return
 * Stripe's cached 5xx for up to 24h).
 */
export async function resumePendingRefunds(): Promise<void> {
  const staleOps = await findPendingOps(5);

  if (staleOps.length === 0) {
    return;
  }

  // Group by orderId. Multi-vendor ops (orderId = null) use a different
  // reconciliation path (W3+) and are skipped here.
  const byOrder = new Map<string, typeof staleOps>();
  for (const op of staleOps) {
    if (!op.orderId) continue;
    const existing = byOrder.get(op.orderId) ?? [];
    existing.push(op);
    byOrder.set(op.orderId, existing);
  }

  const stripe = getStripe();

  for (const [orderId, ops] of byOrder) {
    for (const op of ops) {
      console.info(
        `[refund-service] Crash recovery: resuming ${op.type} op ${op.id} for order ${orderId}`,
      );

      try {
        if (op.type === "refund") {
          // Resume from the Stripe refund call
          if (!op.idempotencyKey) {
            console.warn(`[refund-service] Op ${op.id} has no idempotency key — skipping`);
            continue;
          }

          const [order] = await db
            .select()
            .from(orders)
            .where(eq(orders.id, orderId))
            .limit(1);

          if (!order?.stripePaymentIntentId) {
            console.warn(`[refund-service] Order ${orderId} has no payment intent — skipping`);
            continue;
          }

          let stripeRefund;
          try {
            stripeRefund = await stripe.refunds.create(
              {
                payment_intent: order.stripePaymentIntentId,
                metadata: {
                  piklo_payment_op_id: op.id,
                  piklo_order_id: orderId,
                },
              },
              { idempotencyKey: op.idempotencyKey },
            );
          } catch (err) {
            // LB-3: 5xx during recovery → mark indeterminate_5xx, let
            // webhooks / daily job reconcile. Do NOT rethrow into the outer
            // catch (which would log and move on) — short-circuit cleanly.
            if (err instanceof IndeterminateStripeError) throw err;
            try {
              await classifyAndMarkStripeError(op.id, err);
            } catch (classified) {
              if (classified instanceof IndeterminateStripeError) {
                console.warn(
                  `[refund-service] Recovery: refund op ${op.id} → indeterminate_5xx (webhook will reconcile)`,
                );
                continue;
              }
              throw classified;
            }
            continue;
          }

          await succeedPaymentOp(op.id, stripeRefund.id);

          // H2: also update the refunds row and transition the order
          const [refundRow] = await db
            .select({ id: refunds.id })
            .from(refunds)
            .where(
              and(
                eq(refunds.orderId, orderId),
                inArray(refunds.status, ["pending", "pending_reversal"]),
              ),
            )
            .limit(1);

          if (refundRow) {
            await db
              .update(refunds)
              .set({ status: "processed", stripeRefundId: stripeRefund.id })
              .where(eq(refunds.id, refundRow.id));
          }

          // Transition order → refunded (only if still in a recoverable state)
          await db
            .update(orders)
            .set({ status: "refunded" })
            .where(
              and(
                eq(orders.id, orderId),
                inArray(orders.status, ["paid", "shipped", "delivered", "refund_in_progress"]),
              ),
            );

          console.info(`[refund-service] Recovery: refund op ${op.id} succeeded`);
        } else if (op.type === "reversal") {
          // Resume from the Stripe reversal call
          if (!op.idempotencyKey) {
            console.warn(`[refund-service] Op ${op.id} has no idempotency key — skipping`);
            continue;
          }

          const [order] = await db
            .select()
            .from(orders)
            .where(eq(orders.id, orderId))
            .limit(1);

          if (!order?.stripeTransferId) {
            console.warn(`[refund-service] Order ${orderId} has no transfer ID — skipping`);
            continue;
          }

          let reversalResult;
          try {
            reversalResult = await stripe.transfers.createReversal(
              order.stripeTransferId,
              {
                metadata: {
                  piklo_payment_op_id: op.id,
                  piklo_order_id: orderId,
                },
              },
              { idempotencyKey: op.idempotencyKey },
            );
          } catch (err) {
            if (err instanceof IndeterminateStripeError) throw err;
            try {
              await classifyAndMarkStripeError(op.id, err);
            } catch (classified) {
              if (classified instanceof IndeterminateStripeError) {
                console.warn(
                  `[refund-service] Recovery: reversal op ${op.id} → indeterminate_5xx (webhook will reconcile)`,
                );
                continue;
              }
              throw classified;
            }
            continue;
          }

          await succeedPaymentOp(op.id, reversalResult.id);

          // H2: also update the refunds row and transition the order
          const [refundRow] = await db
            .select({ id: refunds.id })
            .from(refunds)
            .where(
              and(
                eq(refunds.orderId, orderId),
                eq(refunds.status, "pending_reversal"),
              ),
            )
            .limit(1);

          if (refundRow) {
            await db
              .update(refunds)
              .set({ status: "processed" })
              .where(eq(refunds.id, refundRow.id));
          }

          // Transition order → refunded with CAS guard
          await db
            .update(orders)
            .set({ status: "refunded" })
            .where(and(eq(orders.id, orderId), eq(orders.status, "refund_in_progress")));

          console.info(`[refund-service] Recovery: reversal op ${op.id} succeeded`);
        }
      } catch (err) {
        console.error(
          `[refund-service] Crash recovery failed for op ${op.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// LB-3 reconciliation helpers — shared by webhook handlers and daily job
// ---------------------------------------------------------------------------

/**
 * Reconcile a refund `payment_operations` row from an out-of-band signal
 * (webhook or daily reconciliation job) once Stripe confirms the refund
 * side effect landed.
 *
 * Transitions the op from `indeterminate_5xx → succeeded` (CAS-guarded), and
 * runs the same downstream DB writes the live success path would have.
 *
 * Idempotent: repeated calls on an already-reconciled op return silently.
 */
export async function reconcileRefundOpFromStripe(
  opId: string,
  stripeRefundId: string,
): Promise<void> {
  // CAS: only proceed if the op is still indeterminate. Repeated webhook
  // deliveries or overlapping reconciliation runs short-circuit here.
  const transitioned = await succeedIndeterminateOp(opId, stripeRefundId);

  let orderId: string;

  if (transitioned) {
    if (!transitioned.orderId) {
      throw new Error(
        `reconcileRefundOpFromStripe: paymentOp ${opId} has null orderId — not a legacy single-seller op`,
      );
    }
    orderId = transitioned.orderId;
  } else {
    // R2-R3 LB-R2R3-2 resurrection path: op may have been auto-failed by the
    // cron (72h+ indeterminate_5xx → failed + auto_timeout_unverified), but
    // Stripe actually processed the refund and is delivering a late webhook.
    // Only resurrect auto_timeout_unverified — stripe_confirmed_failed and
    // operator_verified_absent are genuine failures and must not be reversed.
    const op = await findPaymentOpById(opId);
    if (
      op &&
      op.status === "failed" &&
      op.failureProvenance === "auto_timeout_unverified"
    ) {
      const resurrected = await succeedAutoFailedOp(opId, stripeRefundId);
      if (resurrected) {
        if (!resurrected.orderId) {
          throw new Error(
            `reconcileRefundOpFromStripe: resurrected paymentOp ${opId} has null orderId — not a legacy single-seller op`,
          );
        }
        orderId = resurrected.orderId;
        await enqueueAdminAlert({
          type: "resurrected_auto_failed_op",
          opId,
          stripeRefundId,
          orderId,
        });
        // Fall through to the shared finalisation block below.
      } else {
        // CAS race — another process already resurrected it. Idempotent no-op.
        return;
      }
    } else {
      // Op is already succeeded, stripe_confirmed_failed, operator_verified_absent,
      // or doesn't exist. Do not resurrect.
      return;
    }
  }

  // Load hold outside the transaction (informational only — all row writes are
  // inside the tx below).
  const [hold] = await db
    .select()
    .from(payoutHolds)
    .where(eq(payoutHolds.orderId, orderId))
    .limit(1);

  await db.transaction(async (tx) => {
    // R2-R2 LB-R2-2: serialise refund + reversal reconcile helpers on the
    // orders row. Both webhooks may arrive concurrently; without this lock
    // the second handler reads stale snapshots (reversal op still
    // indeterminate_5xx) and skips the order finalisation branch, leaving
    // the order in refund_in_progress forever.
    await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);

    // Re-read refund row inside the transaction so we see post-lock state.
    const [refundRow] = await tx
      .select({ id: refunds.id, status: refunds.status })
      .from(refunds)
      .where(
        and(
          eq(refunds.orderId, orderId),
          inArray(refunds.status, ["pending", "pending_reversal"]),
        ),
      )
      .limit(1);

    if (refundRow) {
      // If a reversal is still outstanding (post-transfer path where reversal
      // hasn't landed yet), we only want to mark the refund as pending_reversal
      // — leave the order in refund_in_progress for the reversal path to
      // complete. Otherwise it's the pre-transfer path and we can finalise.
      const reversalStillOutstanding = await hasOutstandingReversalOp(tx, orderId);

      if (reversalStillOutstanding) {
        await tx
          .update(refunds)
          .set({ status: "pending_reversal", stripeRefundId })
          .where(eq(refunds.id, refundRow.id));
        return;
      }

      await tx
        .update(refunds)
        .set({ status: "processed", stripeRefundId })
        .where(eq(refunds.id, refundRow.id));
    }

    // Transition order → refunded if still in a recoverable state.
    await tx
      .update(orders)
      .set({ status: "refunded" })
      .where(
        and(
          eq(orders.id, orderId),
          inArray(orders.status, ["paid", "shipped", "delivered", "refund_in_progress"]),
        ),
      );

    // Transition hold → refunded (matches pre-transfer path writes).
    if (hold && hold.status === "held") {
      await tx
        .update(payoutHolds)
        .set({ status: "refunded" })
        .where(and(eq(payoutHolds.id, hold.id), eq(payoutHolds.status, "held")));
    } else if (hold && hold.status === "blocked") {
      await tx
        .update(payoutHolds)
        .set({ status: "refunded" })
        .where(eq(payoutHolds.id, hold.id));
    }

    await restoreInventory(orderId, tx);
  });
}

/**
 * Reconcile a reversal `payment_operations` row from an out-of-band signal
 * (webhook or daily reconciliation job) once Stripe confirms the reversal
 * side effect landed.
 *
 * Runs the downstream DB writes the post-transfer success path would have
 * (refund → processed, order → refunded, inventory restored).
 *
 * Idempotent: repeated calls on an already-reconciled op return silently.
 */
export async function reconcileReversalOpFromStripe(
  opId: string,
  stripeReversalId: string,
): Promise<void> {
  const transitioned = await succeedIndeterminateOp(opId, stripeReversalId);

  let orderId: string;

  if (transitioned) {
    if (!transitioned.orderId) {
      throw new Error(
        `reconcileReversalOpFromStripe: paymentOp ${opId} has null orderId — not a legacy single-seller op`,
      );
    }
    orderId = transitioned.orderId;
  } else {
    // R2-R3 LB-R2R3-2 resurrection path (reversal variant): cron may have
    // auto-failed this op before Stripe's late success webhook arrived.
    // Only resurrect auto_timeout_unverified — the other provenances are real.
    const op = await findPaymentOpById(opId);
    if (
      op &&
      op.status === "failed" &&
      op.failureProvenance === "auto_timeout_unverified"
    ) {
      const resurrected = await succeedAutoFailedOp(opId, stripeReversalId);
      if (resurrected) {
        if (!resurrected.orderId) {
          throw new Error(
            `reconcileReversalOpFromStripe: resurrected paymentOp ${opId} has null orderId — not a legacy single-seller op`,
          );
        }
        orderId = resurrected.orderId;
        await enqueueAdminAlert({
          type: "resurrected_auto_failed_op",
          opId,
          stripeReversalId,
          orderId,
        });
        // Fall through to the shared finalisation block below.
        // Minimal simplification per plan: only handle pending_reversal case.
        // If refund is still pending, log a warning and skip order finalisation.
      } else {
        // CAS race — another process already resurrected it. Idempotent no-op.
        return;
      }
    } else {
      // Already succeeded, stripe_confirmed_failed, operator_verified_absent,
      // or doesn't exist. Do not resurrect.
      return;
    }
  }

  await db.transaction(async (tx) => {
    // R2-R2 LB-R2-2 (refined): serialise reversal + refund reconcile helpers
    // on the orders row. Without this, both handlers running concurrently
    // on stale snapshots can leave the order in refund_in_progress forever.
    await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);

    // R2-R1 LB-R2-2: look for the refund row in pending_reversal specifically.
    // If it's still in `pending` (meaning the refund webhook hasn't arrived
    // yet), do NOT touch the order — the subsequent refund webhook will
    // complete the join.
    const [refundRow] = await tx
      .select({ id: refunds.id, status: refunds.status })
      .from(refunds)
      .where(
        and(
          eq(refunds.orderId, orderId),
          inArray(refunds.status, ["pending", "pending_reversal"]),
        ),
      )
      .limit(1);

    if (!refundRow || refundRow.status === "pending") {
      // Refund webhook hasn't joined yet. The reversal op is already marked
      // succeeded above; leave orders + refunds alone and let the subsequent
      // refund webhook drive the terminal transition.
      console.info(
        `[refund-service] Reversal op ${opId} reconciled out-of-order ` +
          `(refund still pending) — deferring order finalisation to refund webhook`,
      );
      return;
    }

    // Normal path: refund row is in pending_reversal, safe to finalise.
    await tx
      .update(refunds)
      .set({ status: "processed" })
      .where(eq(refunds.id, refundRow.id));

    await tx
      .update(orders)
      .set({ status: "refunded" })
      .where(and(eq(orders.id, orderId), eq(orders.status, "refund_in_progress")));

    await restoreInventory(orderId, tx);
  });
}

/**
 * Look up a payment operation row by its id. Returns null if missing.
 * Exposed so webhook handlers can resolve metadata.piklo_payment_op_id to a
 * known op before calling the reconcile helpers.
 */
export async function findPaymentOpById(
  opId: string,
): Promise<{
  id: string;
  type: string;
  status: string;
  orderId: string | null;
  failureProvenance: string | null;
} | null> {
  const [row] = await db
    .select({
      id: paymentOperations.id,
      type: paymentOperations.type,
      status: paymentOperations.status,
      orderId: paymentOperations.orderId,
      failureProvenance: paymentOperations.failureProvenance,
    })
    .from(paymentOperations)
    .where(eq(paymentOperations.id, opId))
    .limit(1);

  return row ?? null;
}

async function hasOutstandingReversalOp(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orderId: string,
): Promise<boolean> {
  const rows = await tx
    .select({ id: paymentOperations.id })
    .from(paymentOperations)
    .where(
      and(
        eq(paymentOperations.orderId, orderId),
        eq(paymentOperations.type, "reversal"),
        inArray(paymentOperations.status, ["pending", "indeterminate_5xx"]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Restores channelListing availability for all items in an order.
 *
 * Items with status `sold` are set back to `paused` so they can be
 * re-listed after a refund. Items in other states are left as-is.
 */
async function restoreInventory(
  orderId: string,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<void> {
  const client = tx ?? db;

  // Load all order items with their channel listing IDs
  const items = await client
    .select({ channelListingId: orderItems.channelListingId })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  if (items.length === 0) return;

  const listingIds = items.map((i) => i.channelListingId);

  // Load channel listings → inventory item IDs (filter to sold only)
  const listings = await client
    .select({ id: channelListings.id, inventoryItemId: channelListings.inventoryItemId, status: channelListings.status })
    .from(channelListings)
    .where(inArray(channelListings.id, listingIds));

  const soldListings = listings.filter((l) => l.status === "sold");

  if (soldListings.length === 0) return;

  const soldListingIds = soldListings.map((l) => l.id);
  const soldInventoryIds = soldListings.map((l) => l.inventoryItemId);

  // Batch update: reset all sold listings → paused
  await client
    .update(channelListings)
    .set({ status: "paused" })
    .where(inArray(channelListings.id, soldListingIds));

  // Batch update: reset sold inventory items → available + owned lifecycle
  // Uses sql`version + 1` for optimistic-lock version bump within the transaction.
  await client
    .update(inventoryItems)
    .set({
      availabilityStatus: "available",
      lifecycleState: "owned",
      version: sql`${inventoryItems.version} + 1`,
    })
    .where(
      and(
        inArray(inventoryItems.id, soldInventoryIds),
        eq(inventoryItems.availabilityStatus, "sold"),
      ),
    );
}
