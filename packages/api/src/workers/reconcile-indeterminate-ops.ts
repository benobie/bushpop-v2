/**
 * Reconciliation job for payment_operations stuck in `indeterminate_5xx`
 * (LB-3 / R1; registered via LB-F8-WAL-WORKER Part 1).
 *
 * When a Stripe call returns a 5xx, the WAL op is marked `indeterminate_5xx`
 * and the corresponding refund/reversal side effect is reconciled by
 * webhook handlers in `routes/v1/webhooks/stripe.ts`. This job is the
 * fallback path for the case where the webhook is lost or delayed beyond
 * its retry window.
 *
 * Behaviour for each stuck op (age > grace period, default 1h):
 *   - `refund` ops  → list recent refunds on the order's payment intent and
 *                     match by `metadata.piklo_payment_op_id`. If found,
 *                     call `reconcileRefundOpFromStripe`.
 *   - `reversal` ops → retrieve the transfer and walk its reversals,
 *                     matching by metadata. If found, call
 *                     `reconcileReversalOpFromStripe`.
 *   - If still missing after 24h (Stripe idempotency TTL) → operator task.
 *     Do NOT retry the original call with a new idempotency key.
 *
 * STATUS (2026-04-11): registered as a BullMQ repeatable job via
 * `scheduleReconcileIndeterminateOps()` (every 15 min, 1h grace) and
 * consumed by `startReconcileIndeterminateOpsWorker()`. The function body
 * below is fully implemented for `refund` and `reversal` op types via
 * real Stripe List API calls + metadata matching + delegation to
 * `refund-service.ts` helpers. The `payment_intent_create` op type branch
 * is deferred to Sprint 1b (LB-F8-WAL Part 2) together with the
 * `PaymentOperationType` enum extension. Operator-task escalation on
 * > 24h stuck ops is still TODO (LB-2 / R2 ops console).
 */

import { Worker, Queue, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { orders } from "@bushpop/db/schema";
import { getRedis } from "../lib/redis.js";
import { getStripe } from "../lib/stripe.js";
import { findIndeterminateOps } from "../lib/payment-operations.js";
import {
  reconcileRefundOpFromStripe,
  reconcileReversalOpFromStripe,
} from "../lib/refund-service.js";

const DEFAULT_GRACE_MINUTES = 60;
const STRIPE_IDEMPOTENCY_TTL_HOURS = 24;

export interface ReconcileResult {
  scanned: number;
  reconciled: number;
  stillStuck: number;
  operatorEscalations: number;
}

export async function reconcileIndeterminateOps(
  graceMinutes: number = DEFAULT_GRACE_MINUTES,
): Promise<ReconcileResult> {
  const ops = await findIndeterminateOps(graceMinutes);

  const result: ReconcileResult = {
    scanned: ops.length,
    reconciled: 0,
    stillStuck: 0,
    operatorEscalations: 0,
  };

  if (ops.length === 0) {
    return result;
  }

  const stripe = getStripe();
  const now = Date.now();

  for (const op of ops) {
    const ageHours = (now - new Date(op.createdAt).getTime()) / (1000 * 60 * 60);

    // Multi-vendor ops (orderId = null) use a different reconciliation path
    // tied to order_groups; skip them here (W3+ reconciliation path).
    if (!op.orderId) {
      result.stillStuck += 1;
      continue;
    }

    const opOrderId = op.orderId;

    try {
      if (op.type === "refund") {
        const [order] = await db
          .select({ stripePaymentIntentId: orders.stripePaymentIntentId })
          .from(orders)
          .where(eq(orders.id, opOrderId))
          .limit(1);

        if (!order?.stripePaymentIntentId) {
          console.warn(
            `[reconcile-indeterminate] op ${op.id}: order has no payment intent`,
          );
          result.stillStuck += 1;
          continue;
        }

        const refundsList = await stripe.refunds.list({
          payment_intent: order.stripePaymentIntentId,
          limit: 10,
        });

        const match = refundsList.data.find(
          (r) => r.metadata?.["piklo_payment_op_id"] === op.id,
        );

        if (match) {
          await reconcileRefundOpFromStripe(op.id, match.id);
          result.reconciled += 1;
          continue;
        }
      } else if (op.type === "reversal") {
        const [order] = await db
          .select({ stripeTransferId: orders.stripeTransferId })
          .from(orders)
          .where(eq(orders.id, opOrderId))
          .limit(1);

        if (!order?.stripeTransferId) {
          console.warn(
            `[reconcile-indeterminate] op ${op.id}: order has no transfer id`,
          );
          result.stillStuck += 1;
          continue;
        }

        const transfer = await stripe.transfers.retrieve(order.stripeTransferId, {
          expand: ["reversals"],
        });

        const match = transfer.reversals?.data?.find(
          (r) => r.metadata?.["piklo_payment_op_id"] === op.id,
        );

        if (match) {
          await reconcileReversalOpFromStripe(op.id, match.id);
          result.reconciled += 1;
          continue;
        }
      }

      // Not found on Stripe side
      if (ageHours >= STRIPE_IDEMPOTENCY_TTL_HOURS) {
        // TODO (LB-2 / R2): create operator task in the ops console.
        console.error(
          `[reconcile-indeterminate] op ${op.id} (${op.type}) stuck > 24h with no Stripe match — operator task required`,
        );
        result.operatorEscalations += 1;
      } else {
        console.info(
          `[reconcile-indeterminate] op ${op.id} (${op.type}) still stuck (${ageHours.toFixed(1)}h old) — will retry next cycle`,
        );
        result.stillStuck += 1;
      }
    } catch (err) {
      console.error(
        `[reconcile-indeterminate] op ${op.id} reconcile error:`,
        err instanceof Error ? err.message : err,
      );
      result.stillStuck += 1;
    }
  }

  return result;
}

// ── Queue setup ─────────────────────────────────────────────────────────────

const RECONCILE_QUEUE = "reconcile-indeterminate-ops";
const RECONCILE_JOB_NAME = "reconcile-tick";

let reconcileQueue: Queue | null = null;

function getReconcileQueue(): Queue {
  if (!reconcileQueue) {
    reconcileQueue = new Queue(RECONCILE_QUEUE, { connection: getRedis() });
  }
  return reconcileQueue;
}

// ── Job processor ───────────────────────────────────────────────────────────

async function processReconcileJob(_job: Job): Promise<ReconcileResult> {
  const result = await reconcileIndeterminateOps(DEFAULT_GRACE_MINUTES);
  console.info(
    `[reconcile-indeterminate] scanned=${result.scanned} reconciled=${result.reconciled} stillStuck=${result.stillStuck} operatorEscalations=${result.operatorEscalations}`,
  );
  return result;
}

// ── Enqueue repeatable job ──────────────────────────────────────────────────

/**
 * Register the reconciler as a BullMQ repeatable job running every 15 minutes.
 * Idempotent via `upsertJobScheduler`.
 */
export async function scheduleReconcileIndeterminateOps(): Promise<void> {
  const queue = getReconcileQueue();

  await queue.upsertJobScheduler(
    RECONCILE_JOB_NAME,
    { pattern: "*/15 * * * *", tz: "Australia/Sydney" },
    { name: RECONCILE_JOB_NAME, opts: { removeOnComplete: 10, removeOnFail: 50 } },
  );

  console.info(
    "[reconcile-indeterminate] Repeatable job scheduled (every 15 min AEST)",
  );
}

// ── Worker ──────────────────────────────────────────────────────────────────

export function startReconcileIndeterminateOpsWorker(): Worker {
  const connection = getRedis();

  const worker = new Worker(RECONCILE_QUEUE, processReconcileJob, {
    connection,
    concurrency: 1, // Only one reconciliation pass at a time
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[reconcile-indeterminate] Job ${job?.id} failed:`,
      err.message,
    );
  });

  return worker;
}

// Export queue name for tests
export { RECONCILE_QUEUE };
