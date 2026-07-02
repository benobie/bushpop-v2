/**
 * Order-jobs sweeper (money-safety WS4).
 *
 * Belt-and-braces recovery for AUDIT-010: an order can exist with
 * `jobs_enqueued_at IS NULL` if every webhook delivery crashed before the
 * enqueue completed AND no further delivery arrives. This repeatable job
 * (every 10 min AEST) finds such orders and re-runs the SAME deduped
 * `enqueueOrderJobs` (deterministic BullMQ jobIds make re-enqueue a no-op if
 * the jobs already exist).
 *
 * Uses an ACTIVE-status ALLOWLIST (`paid` / `shipped` / `delivered`) — never a
 * denylist — so refunded / cancelled / completed orders can never receive a
 * late confirmation email.
 */

import { Worker, Queue, type Job } from "bullmq";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { orders } from "@bushpop/db/schema";
import { getRedis } from "../lib/redis.js";
import { enqueueOrderJobs } from "../routes/v1/webhooks/stripe.js";

const ORDER_JOBS_SWEEPER_QUEUE = "order-jobs-sweeper";
const ORDER_JOBS_SWEEPER_JOB_NAME = "order-jobs-sweeper-tick";
const MIN_AGE_MINUTES = 5;

/** Active statuses eligible for a late job-enqueue (ALLOWLIST, not denylist). */
const ACTIVE_STATUSES = ["paid", "shipped", "delivered"] as const;

export interface OrderJobsSweepResult {
  scanned: number;
  enqueued: number;
  failed: number;
}

/** Run a single order-jobs sweep. Exported for tests. */
export async function runOrderJobsSweep(): Promise<OrderJobsSweepResult> {
  const stale = await db
    .select({
      id: orders.id,
      buyerId: orders.buyerId,
      sellerId: orders.sellerId,
      channelId: orders.channelId,
    })
    .from(orders)
    .where(
      and(
        isNull(orders.jobsEnqueuedAt),
        inArray(orders.status, [...ACTIVE_STATUSES]),
        sql`${orders.createdAt} < now() - (${MIN_AGE_MINUTES} * interval '1 minute')`,
      ),
    );

  const result: OrderJobsSweepResult = {
    scanned: stale.length,
    enqueued: 0,
    failed: 0,
  };

  for (const order of stale) {
    try {
      await enqueueOrderJobs(order.id, order.buyerId, order.sellerId, order.channelId);
      result.enqueued += 1;
    } catch (err) {
      console.error(
        `[order-jobs-sweeper] re-enqueue failed for order ${order.id}:`,
        err instanceof Error ? err.message : err,
      );
      result.failed += 1;
    }
  }

  return result;
}

// ── Queue setup ─────────────────────────────────────────────────────────────

let sweeperQueue: Queue | null = null;

function getSweeperQueue(): Queue {
  if (!sweeperQueue) {
    sweeperQueue = new Queue(ORDER_JOBS_SWEEPER_QUEUE, { connection: getRedis() });
  }
  return sweeperQueue;
}

async function processSweepJob(_job: Job): Promise<OrderJobsSweepResult> {
  const result = await runOrderJobsSweep();
  if (result.scanned > 0) {
    console.info(
      `[order-jobs-sweeper] scanned=${result.scanned} enqueued=${result.enqueued} failed=${result.failed}`,
    );
  }
  return result;
}

/** Register the sweeper as a repeatable job (every 10 min AEST). */
export async function scheduleOrderJobsSweeper(): Promise<void> {
  const queue = getSweeperQueue();
  await queue.upsertJobScheduler(
    ORDER_JOBS_SWEEPER_JOB_NAME,
    { pattern: "*/10 * * * *", tz: "Australia/Sydney" },
    { name: ORDER_JOBS_SWEEPER_JOB_NAME, opts: { removeOnComplete: 10, removeOnFail: 50 } },
  );
  console.info("[order-jobs-sweeper] Repeatable job scheduled (every 10 min AEST)");
}

export function startOrderJobsSweeperWorker(): Worker {
  const connection = getRedis();
  const worker = new Worker(ORDER_JOBS_SWEEPER_QUEUE, processSweepJob, {
    connection,
    concurrency: 1,
  });
  worker.on("failed", (job, err) => {
    console.error(`[order-jobs-sweeper] Job ${job?.id} failed:`, err.message);
  });
  return worker;
}

export { ORDER_JOBS_SWEEPER_QUEUE };
