import { Worker, Queue } from "bullmq";
import { getRedis } from "../lib/redis.js";
import { processRefund, resumePendingRefunds } from "../lib/refund-service.js";

// ── Queue setup ──

export const refundQueue = new Queue("refund", {
  connection: getRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  },
});

// ── Job data ──

export interface RefundJobData {
  orderId: string;
  initiatedBy: string;
  reason: string;
}

// ── Worker ──

export function startRefundWorker(): Worker {
  const worker = new Worker<RefundJobData>(
    "refund",
    async (job) => {
      const { orderId, initiatedBy, reason } = job.data;
      await processRefund(orderId, initiatedBy, reason);
    },
    {
      connection: getRedis(),
      concurrency: 1,
      limiter: { max: 1, duration: 1_000 },
    },
  );

  // Crash recovery on worker start
  resumePendingRefunds().catch((err) =>
    console.error("[refund-worker] crash recovery failed:", err),
  );

  worker.on("failed", (job, err) => {
    console.error(`[refund-worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
