import { Worker, Queue } from "bullmq";
import { lt, and, eq, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { inventoryItemImages } from "@bushpop/db/schema";
import { deleteObject } from "../lib/r2.js";
import { getRedis } from "../lib/redis.js";

const QUEUE_NAME = "image-cleanup";
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Clean up orphaned image uploads:
 * - Rows with status = 'pending' older than 1 hour
 * - Rows with status = 'failed'
 *
 * Deletes the R2 object and the DB row.
 */
async function cleanupOrphanImages() {
  const cutoff = new Date(Date.now() - ONE_HOUR_MS);

  const orphans = await db
    .select({ id: inventoryItemImages.id, storageKey: inventoryItemImages.storageKey })
    .from(inventoryItemImages)
    .where(
      sql`(${inventoryItemImages.status} = 'pending' AND ${inventoryItemImages.createdAt} < ${cutoff})
          OR ${inventoryItemImages.status} = 'failed'`,
    );

  if (orphans.length === 0) {
    return { cleaned: 0 };
  }

  let cleaned = 0;
  for (const orphan of orphans) {
    try {
      await deleteObject(orphan.storageKey);
    } catch {
      // Best effort — R2 object might not exist
    }

    await db
      .delete(inventoryItemImages)
      .where(eq(inventoryItemImages.id, orphan.id));

    cleaned++;
  }

  return { cleaned };
}

/**
 * Start the image cleanup worker.
 * Runs as a BullMQ repeating job every hour.
 */
export async function startImageCleanupWorker() {
  const connection = getRedis();

  const queue = new Queue(QUEUE_NAME, { connection });

  // Add repeating job (idempotent — won't duplicate if already exists)
  await queue.upsertJobScheduler(
    "orphan-cleanup",
    { every: ONE_HOUR_MS },
    { name: "cleanup-orphan-images" },
  );

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const result = await cleanupOrphanImages();
      if (result.cleaned > 0) {
        console.log(`[image-cleanup] Cleaned ${result.cleaned} orphan images`);
      }
      return result;
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    console.error(`[image-cleanup] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
