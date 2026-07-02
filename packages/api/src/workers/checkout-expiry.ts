import { Worker, Queue, type Job } from "bullmq";
import { and, inArray, lt, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { checkoutSessions } from "@bushpop/db/schema";
import { getRedis } from "../lib/redis.js";
import { expireCheckoutSession } from "../routes/v1/store/checkout/service.js";
import { CHECKOUT_ACTIVE_STATUSES } from "../lib/commerce-machines.js";

// ── Queue setup ──

const CHECKOUT_EXPIRY_QUEUE = "checkout-expiry";

let expiryQueue: Queue | null = null;

function getExpiryQueue(): Queue {
  if (!expiryQueue) {
    expiryQueue = new Queue(CHECKOUT_EXPIRY_QUEUE, {
      connection: getRedis(),
    });
  }
  return expiryQueue;
}

// ── Job data ──

export interface CheckoutExpiryJobData {
  sessionId: string;
  inventoryItemIds: string[];
  stripePaymentIntentId: string;
}

// ── Schedule expiry ──

/**
 * Schedule a delayed BullMQ job to expire a checkout session at expiresAt.
 *
 * jobId = sessionId ensures one expiry job per session.
 * If a job with the same ID already exists (reuse case), it's a no-op.
 *
 * Note: BullMQ's jobId dedup silently drops re-adds — for fresh sessions
 * this is correct since each session has a unique ULID.
 */
export async function scheduleCheckoutExpiry(
  sessionId: string,
  expiresAt: Date,
  inventoryItemIds: string[],
  stripePaymentIntentId: string,
): Promise<void> {
  const delay = Math.max(0, expiresAt.getTime() - Date.now());
  const queue = getExpiryQueue();

  await queue.add(
    "expire-checkout",
    {
      sessionId,
      inventoryItemIds,
      stripePaymentIntentId,
    } satisfies CheckoutExpiryJobData,
    {
      jobId: `expire-${sessionId}`,
      delay,
      removeOnComplete: true,
      removeOnFail: 3, // keep last 3 failures for debugging
    },
  );
}

// ── Worker ──

export function startCheckoutExpiryWorker(): Worker {
  const connection = getRedis();

  const worker = new Worker<CheckoutExpiryJobData>(
    CHECKOUT_EXPIRY_QUEUE,
    async (job: Job<CheckoutExpiryJobData>) => {
      const { sessionId } = job.data;
      console.info(`[checkout-expiry] Processing expiry for session ${sessionId}`);

      const handled = await expireCheckoutSession(sessionId);
      if (!handled) {
        console.info(`[checkout-expiry] Session ${sessionId} already in terminal state — skipping`);
      } else {
        console.info(`[checkout-expiry] Session ${sessionId} expired successfully`);
      }
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[checkout-expiry] Job ${job?.id} failed for session ${job?.data.sessionId}:`,
      err.message,
    );
  });

  // Safety-net reconciliation: every 5 minutes, find sessions that the delayed
  // job missed (crashed worker, Redis restart, etc.) and expire them.
  const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1_000;

  const reconciliationTimer = setInterval(async () => {
    try {
      await reconcileExpiredSessions();
    } catch (err) {
      console.error("[checkout-expiry] Reconciliation error:", err);
    }
  }, RECONCILIATION_INTERVAL_MS);

  // Prevent timer from keeping process alive
  reconciliationTimer.unref();

  return worker;
}

/**
 * Safety-net: finds sessions that are past their expiry time but still in an
 * active status, and expires them. Uses compare-and-set (expireCheckoutSession),
 * so concurrent processing is safe — 0 rows updated = already handled.
 *
 * Runs every 5 minutes as a background interval inside the expiry worker process.
 */
async function reconcileExpiredSessions(): Promise<void> {
  const now = new Date();

  const overdueSessions = await db
    .select({ id: checkoutSessions.id })
    .from(checkoutSessions)
    .where(
      and(
        inArray(checkoutSessions.status, CHECKOUT_ACTIVE_STATUSES as string[]),
        lt(checkoutSessions.expiresAt, now),
      ),
    )
    .limit(50); // process in batches; next run catches remainder

  if (overdueSessions.length === 0) return;

  console.info(
    `[checkout-expiry] Reconciliation: found ${overdueSessions.length} overdue session(s)`,
  );

  for (const { id } of overdueSessions) {
    try {
      const handled = await expireCheckoutSession(id);
      if (handled) {
        console.info(`[checkout-expiry] Reconciliation expired session ${id}`);
      }
    } catch (err) {
      console.error(`[checkout-expiry] Reconciliation failed for session ${id}:`, err);
    }
  }
}

// Export queue name for use in tests
export { CHECKOUT_EXPIRY_QUEUE };
