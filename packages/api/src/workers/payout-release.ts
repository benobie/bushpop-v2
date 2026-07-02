/**
 * Payout-release worker (money-safety WS5) + transfer-pending reconcile (WS4).
 *
 * A repeatable BullMQ job (every 30 min AEST) that releases held seller payouts
 * via the shared, money-safe `releasePayoutHold` core.
 *
 * GATED OFF by default — `startWorkers()` only wires this up when
 * `PAYOUT_RELEASE_ENABLED=true` (see workers/index.ts), and with an additional
 * live-key guard so deploying the code cannot move real money.
 *
 * Per sweep:
 *   1. Fetch platform balance + cash-reserve threshold ONCE.
 *   2. Select candidate holds (held / release_failed_retryable, not frozen,
 *      with a real delivery/buyer signal).
 *   3. Per hold: recompute eligibility (skip if it had to fall back to now()
 *      or is not yet eligible), apply the reserve gate against a RUNNING
 *      balance view (decrement as each releases), then call releasePayoutHold.
 *
 * Also runs a transfer-pending reconcile pass: stale `transfer` payment_ops in
 * `pending`/`indeterminate_5xx` are List-first reconciled (never blind same-key
 * recreate), because `resumePendingRefunds` ignores `type:"transfer"`.
 */

import { Worker, Queue, type Job } from "bullmq";
import { and, eq, inArray, isNull, or, isNotNull, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { payoutHolds, orders, sellerProfiles } from "@bushpop/db/schema";
import type { Order, PayoutHold } from "@bushpop/types";
import { getRedis } from "../lib/redis.js";
import { getStripe } from "../lib/stripe.js";
import {
  evaluateHoldPolicy,
  getPlatformBalance,
  getCashReserveThreshold,
  releasePayoutHold,
  findLandedTransfer,
  type ReleaseOutcome,
} from "../lib/payout-hold-service.js";
import {
  findStaleTransferOps,
  succeedIndeterminateOp,
  succeedPaymentOp,
} from "../lib/payment-operations.js";

const PAYOUT_RELEASE_QUEUE = "payout-release";
const PAYOUT_RELEASE_JOB_NAME = "payout-release-tick";
const TRANSFER_RECONCILE_GRACE_MINUTES = 15;
const LIST_RECONCILE_WINDOW_HOURS = 48;

export interface PayoutReleaseResult {
  scanned: number;
  released: number;
  adopted: number;
  blocked: number;
  retryable: number;
  manual: number;
  skipped: number;
  reserveSkipped: number;
  transfersReconciled: number;
}

/**
 * Run a single payout-release sweep. Exported for tests.
 */
export async function runPayoutReleaseSweep(): Promise<PayoutReleaseResult> {
  const result: PayoutReleaseResult = {
    scanned: 0,
    released: 0,
    adopted: 0,
    blocked: 0,
    retryable: 0,
    manual: 0,
    skipped: 0,
    reserveSkipped: 0,
    transfersReconciled: 0,
  };

  // 0. Reconcile any crashed-pending transfers first (WS4), so a transfer that
  // landed during a prior crash is adopted before we consider new releases.
  result.transfersReconciled = await reconcilePendingTransfers();

  // 1. Fetch balance + threshold ONCE per sweep (invariant 5).
  const { availableCents } = await getPlatformBalance();
  const threshold = await getCashReserveThreshold();
  let runningAvailable = availableCents;

  // 2. Select candidate holds.
  const candidates = await db
    .select()
    .from(payoutHolds)
    .where(
      and(
        isNull(payoutHolds.frozenAt),
        or(
          and(
            eq(payoutHolds.status, "held"),
            or(
              isNotNull(payoutHolds.deliveryConfirmedAt),
              isNotNull(payoutHolds.buyerConfirmedAt),
            ),
          ),
          and(
            eq(payoutHolds.status, "release_failed_retryable"),
            sql`${payoutHolds.nextRetryAt} <= now()`,
          ),
        ),
      ),
    );

  result.scanned = candidates.length;
  const now = Date.now();

  for (const holdRow of candidates) {
    const hold = holdRow as unknown as PayoutHold;

    // Load order + seller profile for eligibility recompute.
    const [orderRow] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, hold.orderId))
      .limit(1);
    if (!orderRow) {
      result.skipped += 1;
      continue;
    }
    const order = orderRow as unknown as Order;

    const [seller] = await db
      .select({ userId: sellerProfiles.userId, createdAt: sellerProfiles.createdAt })
      .from(sellerProfiles)
      .where(eq(sellerProfiles.userId, order.sellerId))
      .limit(1);
    if (!seller) {
      result.skipped += 1;
      continue;
    }

    // 3a. Eligibility recompute. Skip if eligibility had to fall back to now()
    // (no real delivery/buyer signal) — guards against releasing on a bare
    // policy default.
    const hasRealSignal =
      order.deliveryConfirmedAt !== null ||
      hold.deliveryConfirmedAt !== null ||
      hold.buyerConfirmedAt !== null;
    if (!hasRealSignal) {
      result.skipped += 1;
      continue;
    }

    const policy = await evaluateHoldPolicy(order, seller, hold);
    if (policy.releaseEligibleAt.getTime() > now) {
      result.skipped += 1;
      continue;
    }

    // 3b. Reserve gate against the RUNNING balance (invariant 5).
    if (runningAvailable - hold.amountCents < threshold) {
      result.reserveSkipped += 1;
      continue;
    }

    // 3c. Release via the shared core.
    let outcome: ReleaseOutcome;
    try {
      outcome = await releasePayoutHold(hold.id, "system");
    } catch (err) {
      console.error(
        `[payout-release] releasePayoutHold threw for hold ${hold.id}:`,
        err instanceof Error ? err.message : err,
      );
      result.skipped += 1;
      continue;
    }

    switch (outcome.result) {
      case "released":
        result.released += 1;
        runningAvailable -= hold.amountCents;
        break;
      case "adopted":
        result.adopted += 1;
        runningAvailable -= hold.amountCents;
        break;
      case "blocked":
        result.blocked += 1;
        break;
      case "retryable":
        result.retryable += 1;
        break;
      case "manual":
        result.manual += 1;
        break;
      case "skipped":
        result.skipped += 1;
        break;
    }
  }

  return result;
}

/**
 * Reconcile stale `transfer` payment_ops via List-first (WS4).
 *
 * `resumePendingRefunds` only handles refund/reversal ops; a transfer that
 * crashed mid-flight (pending) or hit a 5xx (indeterminate_5xx) needs this.
 * We List transfers on the seller account and adopt one matching
 * `metadata.piklo_payment_op_id` — never a blind same-key recreate.
 */
async function reconcilePendingTransfers(): Promise<number> {
  const stale = await findStaleTransferOps(TRANSFER_RECONCILE_GRACE_MINUTES);
  if (stale.length === 0) return 0;

  const stripe = getStripe();
  let reconciled = 0;

  for (const op of stale) {
    if (!op.orderId) continue;

    // Resolve the hold + seller account for the List query.
    const [hold] = await db
      .select({ id: payoutHolds.id, sellerStripeAccountId: payoutHolds.sellerStripeAccountId })
      .from(payoutHolds)
      .where(eq(payoutHolds.orderId, op.orderId))
      .limit(1);
    if (!hold) continue;

    try {
      const since = Math.floor(
        (Date.now() - LIST_RECONCILE_WINDOW_HOURS * 3600_000) / 1000,
      );
      // CRITICAL 2: paginate + scope by transfer_group=orderId so a landed
      // transfer can't hide on a later page.
      const match = await findLandedTransfer(
        stripe,
        {
          destination: hold.sellerStripeAccountId,
          orderId: op.orderId,
          sinceUnix: since,
        },
        (t) => t.metadata?.["piklo_payment_op_id"] === op.id,
      );

      if (match) {
        // CRITICAL 1: the transfer landed — mark the op succeeded AND finalise
        // the hold + both transfer-id columns in ONE transaction. Previously
        // succeed*Op committed before the finalisation transaction, so a crash
        // in the window left the op no-longer-indeterminate while the hold had
        // no transferId → next release skipped List-first and double-transferred.
        const orderId = op.orderId;
        await db.transaction(async (tx) => {
          if (op.status === "indeterminate_5xx") {
            await succeedIndeterminateOp(op.id, match.id, tx);
          } else {
            await succeedPaymentOp(op.id, match.id, tx);
          }
          await tx
            .update(orders)
            .set({ stripeTransferId: match.id })
            .where(eq(orders.id, orderId));
          await tx
            .update(payoutHolds)
            .set({ status: "released", transferId: match.id })
            .where(
              and(
                eq(payoutHolds.id, hold.id),
                inArray(payoutHolds.status, [
                  "releasing",
                  "release_failed_retryable",
                  "held",
                ]),
              ),
            );
        });
        reconciled += 1;
      }
    } catch (err) {
      console.error(
        `[payout-release] transfer reconcile failed for op ${op.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return reconciled;
}

// ── Queue setup ─────────────────────────────────────────────────────────────

let payoutReleaseQueue: Queue | null = null;

function getPayoutReleaseQueue(): Queue {
  if (!payoutReleaseQueue) {
    payoutReleaseQueue = new Queue(PAYOUT_RELEASE_QUEUE, { connection: getRedis() });
  }
  return payoutReleaseQueue;
}

async function processPayoutReleaseJob(_job: Job): Promise<PayoutReleaseResult> {
  const result = await runPayoutReleaseSweep();
  console.info(
    `[payout-release] scanned=${result.scanned} released=${result.released} ` +
      `adopted=${result.adopted} blocked=${result.blocked} retryable=${result.retryable} ` +
      `manual=${result.manual} skipped=${result.skipped} reserveSkipped=${result.reserveSkipped} ` +
      `transfersReconciled=${result.transfersReconciled}`,
  );
  return result;
}

/** Register the payout-release sweep as a repeatable job (every 30 min AEST). */
export async function schedulePayoutRelease(): Promise<void> {
  const queue = getPayoutReleaseQueue();
  await queue.upsertJobScheduler(
    PAYOUT_RELEASE_JOB_NAME,
    { pattern: "*/30 * * * *", tz: "Australia/Sydney" },
    { name: PAYOUT_RELEASE_JOB_NAME, opts: { removeOnComplete: 10, removeOnFail: 50 } },
  );
  console.info("[payout-release] Repeatable job scheduled (every 30 min AEST)");
}

export function startPayoutReleaseWorker(): Worker {
  const connection = getRedis();
  const worker = new Worker(PAYOUT_RELEASE_QUEUE, processPayoutReleaseJob, {
    connection,
    concurrency: 1,
  });
  worker.on("failed", (job, err) => {
    console.error(`[payout-release] Job ${job?.id} failed:`, err.message);
  });
  return worker;
}

export { PAYOUT_RELEASE_QUEUE };
