import { Worker, Queue } from "bullmq";
import { and, eq, lt, notExists, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { channelListings, inventoryItems, inventoryItemImages } from "@bushpop/db/schema";
import { deleteObject } from "../lib/r2.js";
import { extractImageId, IMAGE_VARIANT_NAMES } from "../lib/image-url.js";
import { getRedis } from "../lib/redis.js";

const QUEUE_NAME = "image-cleanup";
const ONE_HOUR_MS = 60 * 60 * 1000;
const STALE_DRAFT_DAYS = 30;

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
 * Clean up stale sell-flow drafts (Phase 1 task 11): inventory items still
 * in lifecycle 'owned' with NO channel listing, untouched for 30+ days.
 * Their photos (originals + derived variants) are deleted from R2, image
 * rows removed, and the item archived — sellers start fresh past 30 days
 * (the wizard's resume banner ages out well before that).
 */
export async function cleanupStaleDrafts() {
  const cutoff = new Date(Date.now() - STALE_DRAFT_DAYS * 24 * 60 * 60 * 1000);

  const staleDrafts = await db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.lifecycleState, "owned"),
        lt(inventoryItems.updatedAt, cutoff),
        notExists(
          db
            .select({ one: sql`1` })
            .from(channelListings)
            .where(eq(channelListings.inventoryItemId, inventoryItems.id)),
        ),
      ),
    );

  let archived = 0;
  for (const draft of staleDrafts) {
    // ARCHIVE FIRST, with every staleness condition re-checked atomically in
    // the UPDATE itself (review finding: the snapshot above is racy — a
    // seller can resume/publish between the SELECT and this point). Once
    // archived, the draft endpoints reject the item, so the deletes below
    // cannot race a live seller.
    const archivedRows = await db
      .update(inventoryItems)
      .set({
        lifecycleState: "archived",
        version: sql`${inventoryItems.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventoryItems.id, draft.id),
          eq(inventoryItems.lifecycleState, "owned"),
          lt(inventoryItems.updatedAt, cutoff),
          notExists(
            db
              .select({ one: sql`1` })
              .from(channelListings)
              .where(eq(channelListings.inventoryItemId, inventoryItems.id)),
          ),
        ),
      )
      .returning({ id: inventoryItems.id });
    if (archivedRows.length === 0) continue; // resumed or published meanwhile

    const images = await db
      .select({ id: inventoryItemImages.id, storageKey: inventoryItemImages.storageKey })
      .from(inventoryItemImages)
      .where(eq(inventoryItemImages.inventoryItemId, draft.id));

    for (const image of images) {
      // Original + derived variants — all best-effort.
      try {
        await deleteObject(image.storageKey);
      } catch {
        // Orphaned objects are caught on a later sweep
      }
      const imageId = extractImageId(image.storageKey);
      if (imageId) {
        for (const variant of IMAGE_VARIANT_NAMES) {
          try {
            await deleteObject(`items/${draft.id}/${variant}/${imageId}.webp`);
          } catch {
            // Variant may never have been generated
          }
        }
      }
      await db.delete(inventoryItemImages).where(eq(inventoryItemImages.id, image.id));
    }

    archived++;
  }

  return { archived };
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
      const drafts = await cleanupStaleDrafts();
      if (drafts.archived > 0) {
        console.log(`[image-cleanup] Archived ${drafts.archived} stale drafts (>${STALE_DRAFT_DAYS}d)`);
      }
      return { ...result, ...drafts };
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    console.error(`[image-cleanup] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
