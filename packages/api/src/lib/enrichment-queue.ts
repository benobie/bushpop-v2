import { Queue } from "bullmq";
import { getRedis } from "./redis.js";

export const ENRICHMENT_QUEUE = "ai-enrichment";

let enrichmentQueue: Queue | null = null;

export function getEnrichmentQueue(): Queue {
  if (!enrichmentQueue) {
    enrichmentQueue = new Queue(ENRICHMENT_QUEUE, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: { count: 50 },
      },
    });
  }
  return enrichmentQueue;
}

/**
 * Enqueue an enrichment job with real debounce.
 * Removes any existing non-active job for this item before adding a new one
 * with a 30s delay. This resets the window on each image confirm so enrichment
 * runs once after uploads settle.
 */
export async function enqueueEnrichment(
  inventoryItemId: string,
  ownerId: string,
): Promise<void> {
  const queue = getEnrichmentQueue();
  const jobId = `enrich-${inventoryItemId}`;

  try {
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state !== "active") {
        await existing.remove();
      }
      // If active — let it run; stale-write check in worker handles requeue
    }
    await queue.add(
      "enrich-item",
      { inventoryItemId, ownerId },
      { jobId, delay: 30_000 },
    );
  } catch (err) {
    console.error("[enrichment] Failed to enqueue:", err);
  }
}
