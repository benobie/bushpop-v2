import { Queue, Worker, type Job } from "bullmq";
import { getRedis } from "../lib/redis.js";
import { getMeiliClient } from "../lib/meilisearch.js";
import {
  fetchFullListing,
  fetchActiveListingsForSeller,
  buildListingDocument,
  getListingIndexName,
  shouldIndexListing,
} from "../lib/search-index.js";

export const SEARCH_SYNC_QUEUE = "search-sync";

let searchSyncQueue: Queue | null = null;

function getSearchSyncQueue(): Queue {
  if (!searchSyncQueue) {
    searchSyncQueue = new Queue(SEARCH_SYNC_QUEUE, { connection: getRedis() });
  }
  return searchSyncQueue;
}

/** Enqueue a job to the search-sync queue (called by event-consumer to fan out). */
export async function enqueueSearchSync(data: MarketplaceEventJobData): Promise<void> {
  await getSearchSyncQueue().add(data.eventName, data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });
}

// ---------------------------------------------------------------------------
// Job data shape (mirrors dispatchEvent in lib/events.ts)
// ---------------------------------------------------------------------------

interface MarketplaceEventJobData {
  eventId: string;
  eventName: string;
  category: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  channelId?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

/**
 * Determine whether a MeiliSearch error is retryable.
 * Connection timeouts and 5xx responses should be retried.
 * Document validation errors (4xx, malformed data) should not.
 */
function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return true; // Unknown — assume retryable

  // MeiliSearch SDK error codes
  if ("code" in err && typeof (err as { code: unknown }).code === "string") {
    const code = (err as { code: string }).code;
    // Connection/network errors
    if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ETIMEDOUT") {
      return true;
    }
  }

  // HTTP status codes on MeiliSearch API errors
  if ("httpStatus" in err) {
    const status = (err as { httpStatus: number }).httpStatus;
    if (status >= 500) return true;
    if (status >= 400 && status < 500) return false; // Client error — don't retry
  }

  return true; // Default: retry
}

/**
 * Process a marketplace event job and sync the affected listing(s) to MeiliSearch.
 */
export async function processSearchSyncJob(
  job: Job<MarketplaceEventJobData>,
): Promise<void> {
  const { eventName, entityId, channelId } = job.data;

  // Filter: only process listing and seller events
  const HANDLED_EVENTS = new Set([
    "channel_listing.created",
    "channel_listing.status_changed",
    "channel_listing.content_changed",
    "channel_listing.archived",
    "listing.visibility_changed",
    "seller_profile.updated",
    "listing_score.calculated",
  ]);

  if (!HANDLED_EVENTS.has(eventName)) {
    return; // No-op
  }

  const client = getMeiliClient();

  try {
    // -----------------------------------------------------------------------
    // channel_listing.archived — delete from index, no DB fetch needed
    // -----------------------------------------------------------------------
    if (eventName === "channel_listing.archived") {
      if (!entityId || !channelId) {
        console.warn(`[search-sync] archived event missing entityId/channelId — skipping (jobId=${job.id})`);
        return;
      }

      // We need the channel slug to get the index name
      // Fetch from DB (channel slug is not in the event payload)
      const { db } = await import("@bushpop/db/client");
      const { channels } = await import("@bushpop/db/schema");
      const { eq } = await import("drizzle-orm");

      const channelRows = await db
        .select({ slug: channels.slug })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

      if (!channelRows[0]) {
        console.warn(`[search-sync] channel not found for channelId=${channelId} — skipping`);
        return;
      }

      const indexName = getListingIndexName(channelRows[0].slug);
      const index = client.index(indexName);
      await index.deleteDocument(entityId).waitTask();
      console.info(`[search-sync] Deleted listing ${entityId} from index "${indexName}"`);
      return;
    }

    // -----------------------------------------------------------------------
    // channel_listing.created / channel_listing.status_changed — upsert or delete
    // -----------------------------------------------------------------------
    if (
      eventName === "channel_listing.created" ||
      eventName === "channel_listing.status_changed"
    ) {
      if (!entityId) {
        console.warn(`[search-sync] ${eventName} missing entityId — skipping (jobId=${job.id})`);
        return;
      }

      const row = await fetchFullListing(entityId);

      if (!row) {
        // Listing was deleted — log and ack, no retry
        console.warn(
          `[search-sync] Listing ${entityId} not found in DB — likely deleted. Acking without retry.`,
        );
        return;
      }

      // Need channel slug to determine index name
      const { db } = await import("@bushpop/db/client");
      const { channels } = await import("@bushpop/db/schema");
      const { eq } = await import("drizzle-orm");

      const channelRows = await db
        .select({ slug: channels.slug })
        .from(channels)
        .where(eq(channels.id, row.listing.channelId))
        .limit(1);

      if (!channelRows[0]) {
        console.warn(`[search-sync] channel not found for listing ${entityId} — skipping`);
        return;
      }

      const indexName = getListingIndexName(channelRows[0].slug);
      const index = client.index(indexName);

      if (row.listing.status === "active" && shouldIndexListing(row.listing)) {
        const doc = buildListingDocument(row);
        await index.addDocuments([doc], { primaryKey: "id" }).waitTask();
        console.info(`[search-sync] Upserted listing ${entityId} into "${indexName}"`);
      } else {
        // Non-active status or hidden — remove from index
        await index.deleteDocument(entityId).waitTask();
        console.info(
          `[search-sync] Removed listing ${entityId} from "${indexName}" (status=${row.listing.status}, hidden=${row.listing.hiddenAt !== null})`,
        );
      }
      return;
    }

    // -----------------------------------------------------------------------
    // channel_listing.content_changed — re-index listing with updated content
    // -----------------------------------------------------------------------
    if (eventName === "channel_listing.content_changed") {
      if (!entityId) {
        console.warn(`[search-sync] channel_listing.content_changed missing entityId — skipping (jobId=${job.id})`);
        return;
      }

      const row = await fetchFullListing(entityId);

      if (!row) {
        console.warn(`[search-sync] Listing ${entityId} not found in DB — skipping content_changed re-index.`);
        return;
      }

      if (!shouldIndexListing(row.listing)) {
        console.info(`[search-sync] Listing ${entityId} is hidden — skipping content_changed re-index.`);
        return;
      }

      const { db } = await import("@bushpop/db/client");
      const { channels } = await import("@bushpop/db/schema");
      const { eq } = await import("drizzle-orm");

      const channelRows = await db
        .select({ slug: channels.slug })
        .from(channels)
        .where(eq(channels.id, row.listing.channelId))
        .limit(1);

      if (!channelRows[0]) {
        console.warn(`[search-sync] channel not found for listing ${entityId} — skipping`);
        return;
      }

      const indexName = getListingIndexName(channelRows[0].slug);
      const index = client.index(indexName);
      const doc = buildListingDocument(row);
      await index.addDocuments([doc], { primaryKey: "id" }).waitTask();
      console.info(`[search-sync] Re-indexed listing ${entityId} into "${indexName}" (content changed)`);
      return;
    }

    // -----------------------------------------------------------------------
    // listing.visibility_changed — upsert or delete based on hidden_at
    // -----------------------------------------------------------------------
    if (eventName === "listing.visibility_changed") {
      if (!entityId) {
        console.warn(`[search-sync] listing.visibility_changed missing entityId — skipping (jobId=${job.id})`);
        return;
      }

      const row = await fetchFullListing(entityId);

      if (!row) {
        console.warn(
          `[search-sync] Listing ${entityId} not found in DB — likely deleted. Acking without retry.`,
        );
        return;
      }

      const { db } = await import("@bushpop/db/client");
      const { channels } = await import("@bushpop/db/schema");
      const { eq } = await import("drizzle-orm");

      const channelRows = await db
        .select({ slug: channels.slug })
        .from(channels)
        .where(eq(channels.id, row.listing.channelId))
        .limit(1);

      if (!channelRows[0]) {
        console.warn(`[search-sync] channel not found for listing ${entityId} — skipping`);
        return;
      }

      const indexName = getListingIndexName(channelRows[0].slug);
      const index = client.index(indexName);

      if (shouldIndexListing(row.listing)) {
        const doc = buildListingDocument(row);
        await index.addDocuments([doc], { primaryKey: "id" }).waitTask();
        console.info(`[search-sync] Re-indexed listing ${entityId} into "${indexName}" (visibility restored)`);
      } else {
        await index.deleteDocument(entityId).waitTask();
        console.info(`[search-sync] Deleted listing ${entityId} from "${indexName}" (hidden_at set)`);
      }
      return;
    }

    // -----------------------------------------------------------------------
    // listing_score.calculated — re-index listing with updated scores
    // -----------------------------------------------------------------------
    if (eventName === "listing_score.calculated") {
      if (!entityId) {
        console.warn(`[search-sync] listing_score.calculated missing entityId — skipping (jobId=${job.id})`);
        return;
      }

      const row = await fetchFullListing(entityId);

      if (!row) {
        console.warn(`[search-sync] Listing ${entityId} not found in DB — skipping score re-index.`);
        return;
      }

      if (row.listing.status !== "active" || !shouldIndexListing(row.listing)) {
        console.info(
          `[search-sync] Listing ${entityId} is not indexable — skipping score re-index (status=${row.listing.status}, hidden=${row.listing.hiddenAt !== null}).`,
        );
        return;
      }

      const { db } = await import("@bushpop/db/client");
      const { channels } = await import("@bushpop/db/schema");
      const { eq } = await import("drizzle-orm");

      const channelRows = await db
        .select({ slug: channels.slug })
        .from(channels)
        .where(eq(channels.id, row.listing.channelId))
        .limit(1);

      if (!channelRows[0]) {
        console.warn(`[search-sync] channel not found for listing ${entityId} — skipping`);
        return;
      }

      const indexName = getListingIndexName(channelRows[0].slug);
      const index = client.index(indexName);
      const doc = buildListingDocument(row);
      await index.addDocuments([doc], { primaryKey: "id" }).waitTask();
      console.info(`[search-sync] Re-indexed listing ${entityId} into "${indexName}" (scores updated)`);
      return;
    }

    // -----------------------------------------------------------------------
    // seller_profile.updated — re-index all active listings for the seller
    // -----------------------------------------------------------------------
    if (eventName === "seller_profile.updated") {
      if (!entityId) {
        console.warn(`[search-sync] seller_profile.updated missing entityId — skipping`);
        return;
      }

      // entityId for seller_profile.updated is the userId (ownerId)
      const rows = await fetchActiveListingsForSeller(entityId);

      if (rows.length === 0) {
        console.info(`[search-sync] No active listings for seller userId=${entityId} — nothing to re-index`);
        return;
      }

      // Fetch channel slugs for all affected channelIds
      const channelIds = [...new Set(rows.map((r) => r.listing.channelId))];
      const { db } = await import("@bushpop/db/client");
      const { channels } = await import("@bushpop/db/schema");
      const { inArray } = await import("drizzle-orm");

      const channelRows = await db
        .select({ id: channels.id, slug: channels.slug })
        .from(channels)
        .where(inArray(channels.id, channelIds));

      const slugById = new Map(channelRows.map((c) => [c.id, c.slug]));

      // Group docs by channel index
      const byIndex = new Map<string, typeof rows>();
      for (const row of rows) {
        const slug = slugById.get(row.listing.channelId);
        if (!slug) continue;
        const indexName = getListingIndexName(slug);
        const existing = byIndex.get(indexName) ?? [];
        existing.push(row);
        byIndex.set(indexName, existing);
      }

      for (const [indexName, indexRows] of byIndex) {
        const index = client.index(indexName);
        const docs = indexRows.map(buildListingDocument);
        await index.addDocuments(docs, { primaryKey: "id" }).waitTask();
        console.info(
          `[search-sync] Re-indexed ${docs.length} listing(s) for seller ${entityId} into "${indexName}"`,
        );
      }
    }
  } catch (err: unknown) {
    if (isRetryableError(err)) {
      // Rethrow — let BullMQ retry logic handle it
      throw err;
    }
    // Non-retryable error (document validation, bad data) — log and ack
    console.error(
      `[search-sync] Non-retryable error processing ${eventName} (jobId=${job.id}):`,
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/**
 * Start the search-sync BullMQ worker.
 * Connects to the existing marketplace-events queue and syncs MeiliSearch.
 * Must only be called after the bootstrap sub-step has completed.
 */
export function startSearchSyncWorker(): Worker {
  const connection = getRedis();

  const worker = new Worker<MarketplaceEventJobData>(
    SEARCH_SYNC_QUEUE,
    processSearchSyncJob,
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[search-sync] Job ${job?.id} failed (event=${job?.data?.eventName}):`,
      err.message,
    );
  });

  return worker;
}
