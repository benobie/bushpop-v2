import { Queue, Worker, type Job } from "bullmq";
import { and, eq, gte, lt, or } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { notifications } from "@bushpop/db/schema";
import { getRedis } from "../lib/redis.js";
import { enqueueEmail, type EmailJobType } from "./email.js";

const SWEEPER_QUEUE = "notification-sweeper";
const SWEEPER_MAX_ATTEMPTS = 3;
const STALE_PENDING_MS = 30 * 60 * 1000;
const STALE_LEASE_MS = 5 * 60 * 1000;

let sweeperQueue: Queue | null = null;

function getSweeperQueue(): Queue {
  if (!sweeperQueue) {
    sweeperQueue = new Queue(SWEEPER_QUEUE, {
      connection: getRedis(),
    });
  }

  return sweeperQueue;
}

type ClaimedNotificationRow = {
  id: string;
  type: string;
  payload: unknown;
};

async function markExceededNotificationsFailed(
  stalePendingThreshold: Date,
  staleLeaseThreshold: Date,
): Promise<void> {
  await db
    .update(notifications)
    .set({
      status: "failed",
      failedAt: new Date(),
      lastError: "sweeper: max attempts exceeded",
    })
    .where(
      and(
        gte(notifications.attemptCount, SWEEPER_MAX_ATTEMPTS),
        or(
          and(
            eq(notifications.status, "pending"),
            lt(notifications.createdAt, stalePendingThreshold),
          ),
          and(
            eq(notifications.status, "sending"),
            lt(notifications.sendingAt, staleLeaseThreshold),
          ),
        ),
      ),
    );
}

async function claimPendingNotifications(stalePendingThreshold: Date): Promise<ClaimedNotificationRow[]> {
  return db
    .update(notifications)
    .set({
      status: "sending",
      sendingAt: new Date(),
    })
    .where(
      and(
        eq(notifications.status, "pending"),
        lt(notifications.createdAt, stalePendingThreshold),
        lt(notifications.attemptCount, SWEEPER_MAX_ATTEMPTS),
      ),
    )
    .returning({
      id: notifications.id,
      type: notifications.type,
      payload: notifications.payload,
    });
}

async function claimExpiredLeases(staleLeaseThreshold: Date): Promise<ClaimedNotificationRow[]> {
  return db
    .update(notifications)
    .set({
      status: "sending",
      sendingAt: new Date(),
    })
    .where(
      and(
        eq(notifications.status, "sending"),
        lt(notifications.sendingAt, staleLeaseThreshold),
        lt(notifications.attemptCount, SWEEPER_MAX_ATTEMPTS),
      ),
    )
    .returning({
      id: notifications.id,
      type: notifications.type,
      payload: notifications.payload,
    });
}

async function reenqueueClaimedNotifications(rows: ClaimedNotificationRow[]): Promise<void> {
  for (const row of rows) {
    const payload = row.payload as Record<string, unknown>;
    const entityId =
      typeof payload["entityId"] === "string" && payload["entityId"].length > 0
        ? payload["entityId"]
        : row.id;

    await enqueueEmail({
      type: row.type as EmailJobType,
      orderId: entityId,
      notificationId: row.id,
      notificationLeaseHeld: true,
    });
  }
}

async function runSweep(): Promise<void> {
  const stalePendingThreshold = new Date(Date.now() - STALE_PENDING_MS);
  const staleLeaseThreshold = new Date(Date.now() - STALE_LEASE_MS);

  await markExceededNotificationsFailed(stalePendingThreshold, staleLeaseThreshold);

  const [claimedPendingRows, claimedExpiredLeaseRows] = await Promise.all([
    claimPendingNotifications(stalePendingThreshold),
    claimExpiredLeases(staleLeaseThreshold),
  ]);

  const claimedRows = [...claimedPendingRows, ...claimedExpiredLeaseRows];
  if (claimedRows.length === 0) {
    return;
  }

  console.info(`[sweeper] Re-enqueuing ${claimedRows.length} notification(s)`);
  await reenqueueClaimedNotifications(claimedRows);
}

export function startNotificationSweeperWorker(): Worker {
  const queue = getSweeperQueue();

  queue
    .add(
      "sweep",
      {},
      {
        repeat: { every: 5 * 60 * 1000 },
        jobId: "notification-sweeper-repeat",
        removeOnComplete: 10,
        removeOnFail: 5,
      },
    )
    .catch((error) => {
      console.error("[sweeper] Failed to register repeatable job:", error);
    });

  const worker = new Worker(
    SWEEPER_QUEUE,
    async (_job: Job) => {
      await runSweep();
    },
    {
      connection: getRedis(),
      concurrency: 1,
    },
  );

  worker.on("failed", (_job, error) => {
    console.error("[sweeper] Sweep job failed:", error.message);
  });

  return worker;
}

export { SWEEPER_QUEUE };

export async function runNotificationSweeperForTest(): Promise<void> {
  return runSweep();
}
