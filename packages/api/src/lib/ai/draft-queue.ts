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
  await getAiDraftQueue().add("generate-draft", data, { jobId: data.generationId });
}
