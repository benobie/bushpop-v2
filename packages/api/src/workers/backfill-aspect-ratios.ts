/**
 * One-off BullMQ job: backfill aspect_ratio on inventory_item_images.
 *
 * Spec: FM-R2-2 + FM-R3-4 (Sprint 1a C4-RETROFIT)
 *
 * Reads all inventory_item_images where aspect_ratio IS NULL AND backfill_status IS NULL
 * in batches of 50. For each image:
 *  - Success: SET aspect_ratio = :val, backfill_status = 'populated' (conditional write)
 *  - Sharp error (corrupt): SET backfill_status = 'skipped_corrupt'
 *  - R2 fetch error: retry 3x, then SET backfill_status = 'failed_unreadable'
 *
 * Deploy gate: SELECT COUNT(*) FROM inventory_item_images
 *              WHERE aspect_ratio IS NULL AND backfill_status IS NULL
 *              must return 0.
 */

import { Worker, Queue, type Job } from "bullmq";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { inventoryItemImages } from "@bushpop/db/schema";
import { getRedis } from "../lib/redis.js";
import { getR2Client } from "../lib/r2.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const BACKFILL_QUEUE = "backfill-aspect-ratios";
const JOB_NAME = "backfill-aspect-ratios";
const BATCH_SIZE = 50;
const R2_MAX_RETRIES = 3;

let backfillQueue: Queue | null = null;

function getBackfillQueue(): Queue {
  if (!backfillQueue) {
    backfillQueue = new Queue(BACKFILL_QUEUE, {
      connection: getRedis(),
    });
  }
  return backfillQueue;
}

async function fetchImageBuffer(storageKey: string, attempt = 0): Promise<Buffer> {
  const r2 = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME!;

  try {
    const getCmd = new GetObjectCommand({ Bucket: bucket, Key: storageKey });
    const res = await r2.send(getCmd);
    if (!res.Body) throw new Error("Empty body");

    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    if (attempt < R2_MAX_RETRIES - 1) {
      console.warn(`[backfill-aspect-ratios] R2 fetch failed for ${storageKey} (attempt ${attempt + 1}/${R2_MAX_RETRIES}), retrying...`);
      return fetchImageBuffer(storageKey, attempt + 1);
    }
    throw err;
  }
}

async function processBackfillJob(_job: Job): Promise<void> {
  console.info("[backfill-aspect-ratios] Starting aspect ratio backfill");

  let processedTotal = 0;
  let populated = 0;
  let skippedCorrupt = 0;
  let failedUnreadable = 0;

  // Process in batches until no more unprocessed rows
  while (true) {
    const batch = await db
      .select({
        id: inventoryItemImages.id,
        storageKey: inventoryItemImages.storageKey,
      })
      .from(inventoryItemImages)
      .where(
        and(
          isNull(inventoryItemImages.aspectRatio),
          isNull(inventoryItemImages.backfillStatus),
        ),
      )
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    console.info(`[backfill-aspect-ratios] Processing batch of ${batch.length} images`);

    for (const img of batch) {
      try {
        // Try to fetch from R2 (3 retries)
        let inputBuffer: Buffer;
        try {
          inputBuffer = await fetchImageBuffer(img.storageKey);
        } catch {
          // R2 fetch failed after all retries
          await db
            .update(inventoryItemImages)
            .set({ backfillStatus: "failed_unreadable" })
            .where(eq(inventoryItemImages.id, img.id));
          failedUnreadable++;
          console.warn(`[backfill-aspect-ratios] Image ${img.id} failed_unreadable (R2 error)`);
          continue;
        }

        // Try to get metadata with Sharp
        let metadata: sharp.Metadata;
        try {
          metadata = await sharp(inputBuffer).metadata();
        } catch {
          // Sharp error — corrupt image
          await db
            .update(inventoryItemImages)
            .set({ backfillStatus: "skipped_corrupt" })
            .where(eq(inventoryItemImages.id, img.id));
          skippedCorrupt++;
          console.warn(`[backfill-aspect-ratios] Image ${img.id} skipped_corrupt (Sharp error)`);
          continue;
        }

        const width = metadata.width ?? 1;
        const height = metadata.height ?? 1;
        const aspectRatio = width / height;

        // Conditional write: don't clobber a value written by the enrichment worker
        await db
          .update(inventoryItemImages)
          .set({
            aspectRatio: String(aspectRatio),
            backfillStatus: "populated",
          })
          .where(
            and(
              eq(inventoryItemImages.id, img.id),
              isNull(inventoryItemImages.aspectRatio),
            ),
          );

        populated++;
        console.info(`[backfill-aspect-ratios] Image ${img.id} populated (aspect_ratio=${aspectRatio.toFixed(4)})`);
      } catch (err) {
        // Unexpected error — mark as failed_unreadable to avoid infinite loop
        console.error(`[backfill-aspect-ratios] Unexpected error for image ${img.id}:`, err);
        await db
          .update(inventoryItemImages)
          .set({ backfillStatus: "failed_unreadable" })
          .where(eq(inventoryItemImages.id, img.id));
        failedUnreadable++;
      }
    }

    processedTotal += batch.length;
  }

  console.info(
    `[backfill-aspect-ratios] Complete. Total=${processedTotal}, populated=${populated}, skipped_corrupt=${skippedCorrupt}, failed_unreadable=${failedUnreadable}`,
  );
}

/**
 * Enqueue the one-off backfill job (idempotent — uses fixed jobId).
 * Call this at deploy time.
 */
export async function scheduleBackfillAspectRatios(): Promise<void> {
  const queue = getBackfillQueue();
  const existingJob = await queue.getJob(JOB_NAME);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state !== "failed" && state !== "unknown") {
      console.info(`[backfill-aspect-ratios] Job already exists in state: ${state} — skipping enqueue`);
      return;
    }
  }

  await queue.add(JOB_NAME, {}, {
    jobId: JOB_NAME,
    removeOnComplete: true,
    removeOnFail: 3,
  });

  console.info("[backfill-aspect-ratios] One-off backfill job enqueued");
}

export function startBackfillAspectRatiosWorker(): Worker {
  const connection = getRedis();

  const worker = new Worker(
    BACKFILL_QUEUE,
    processBackfillJob,
    {
      connection,
      concurrency: 1, // One batch at a time — memory-safe
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[backfill-aspect-ratios] Job ${job?.id} failed:`, err.message);
  });

  worker.on("completed", () => {
    console.info("[backfill-aspect-ratios] Backfill job completed successfully");
  });

  return worker;
}

export { BACKFILL_QUEUE };
