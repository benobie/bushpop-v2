import { Queue } from "bullmq";
import { getRedis } from "../redis.js";

/**
 * ai-draft queue (task 6 worker). jobId = the ai_generations row ulid —
 * status lives in Postgres, BullMQ is transport only.
 */

export const AI_DRAFT_QUEUE = "ai-draft";

export interface AiDraftJobData {
  generationId: string;
  inventoryItemId: string;
  sellerId: string;
}

let aiDraftQueue: Queue | null = null;

export function getAiDraftQueue(): Queue {
  if (!aiDraftQueue) {
    aiDraftQueue = new Queue(AI_DRAFT_QUEUE, {
      connection: getRedis(),
      // Single attempt: escalation happens INSIDE the worker run and every
      // outcome is finalised in Postgres — a BullMQ retry would double-bill.
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: { count: 50 },
      },
    });
  }
  return aiDraftQueue;
}

export async function enqueueAiDraftJob(data: AiDraftJobData): Promise<void> {
  const queue = getAiDraftQueue();

  // BullMQ dedupes adds by jobId against RETAINED jobs — including failed
  // ones kept by removeOnFail. Without clearing a terminal leftover, a
  // pending generation whose job crashed pre-finalise could never be
  // re-enqueued (review finding): the idempotent-on-pending path reuses the
  // generation id, add() would silently no-op, and the poll would show
  // pending forever.
  const existing = await queue.getJob(data.generationId);
  if (existing) {
    const state = await existing.getState();
    if (state === "failed" || state === "completed") {
      await existing.remove();
    } else {
      return; // queued/active/delayed — already in flight
    }
  }

  await queue.add("generate-draft", data, { jobId: data.generationId });
}
