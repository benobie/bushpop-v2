import crypto from "node:crypto";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { scoreToQualityTier } from "@bushpop/config";
import { db } from "@bushpop/db/client";
import {
  channelListings,
  inventoryItems,
  inventoryItemImages,
  sellerProfiles,
  categories,
  channels as channelsTable,
  listingScores,
} from "@bushpop/db/schema";
import { getMeiliClient } from "./meilisearch.js";
import { cardOrOriginalUrl } from "./image-url.js";
import { getRedis } from "./redis.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** MeiliSearch index name per channel slug. */
export function getListingIndexName(channelSlug: string): string {
  return `listings_${channelSlug}`;
}

/** Settings object — hash is used to version the bootstrap flag. */
const INDEX_SETTINGS_FROZEN = {
  searchableAttributes: ["title", "description", "brand", "sellerStoreName", "tags"],
  filterableAttributes: [
    "channelId",
    "status",
    "categorySlug",
    "size",
    "colour",
    "brand",
    "condition",
    "priceCents",
    "qualityTier",
  ],
  sortableAttributes: ["priceCents", "publishedAt", "id", "listingScore"],
} as const;

// Mutable copy for MeiliSearch SDK (Settings expects mutable arrays)
const INDEX_SETTINGS = {
  searchableAttributes: [...INDEX_SETTINGS_FROZEN.searchableAttributes],
  filterableAttributes: [...INDEX_SETTINGS_FROZEN.filterableAttributes],
  sortableAttributes: [...INDEX_SETTINGS_FROZEN.sortableAttributes],
};

const SETTINGS_HASH = crypto
  .createHash("sha256")
  .update(JSON.stringify(INDEX_SETTINGS_FROZEN))
  .digest("hex")
  .slice(0, 12);

/** Returns a channel-scoped Redis key for the bootstrap flag. */
function getBootstrapFlagKey(channelSlug: string): string {
  return `search_bootstrap:v${SETTINGS_HASH}:${channelSlug}`;
}

// ---------------------------------------------------------------------------
// Document type
// ---------------------------------------------------------------------------

export interface ListingDocument {
  id: string;
  channelId: string;
  title: string;
  description: string | null;
  handle: string;
  priceCents: number;
  currency: string;
  status: string;
  brand: string | null;
  size: string | null;
  colour: string | null;
  condition: string | null;
  categorySlug: string | null;
  tags: string[];
  publishedAt: number | null; // Unix timestamp (ms) — faster numeric sort
  primaryImageUrl: string | null;
  seller: {
    id: string;
    handle: string;
    storeName: string;
    avatarUrl: string | null;
  };
  sellerStoreName: string; // denormalised for searchableAttributes
  listingScore: number;
  qualityTier: string;
}

// ---------------------------------------------------------------------------
// Full join query types
// ---------------------------------------------------------------------------

type FullListingRow = {
  listing: typeof channelListings.$inferSelect;
  item: typeof inventoryItems.$inferSelect;
  seller: typeof sellerProfiles.$inferSelect;
  image: typeof inventoryItemImages.$inferSelect | null;
  category: typeof categories.$inferSelect | null;
  score: typeof listingScores.$inferSelect | null;
};

// ---------------------------------------------------------------------------
// Visibility predicate
// ---------------------------------------------------------------------------

/**
 * Returns true if the listing should appear in the MeiliSearch index.
 * A listing is hidden when `hidden_at` is set (non-null).
 */
export function shouldIndexListing(listing: { hiddenAt: Date | null }): boolean {
  return listing.hiddenAt === null;
}

// ---------------------------------------------------------------------------
// Join queries
// ---------------------------------------------------------------------------

/**
 * Fetch a single listing with all data needed for the search document.
 * Returns null if the listing does not exist.
 */
export async function fetchFullListing(listingId: string): Promise<FullListingRow | null> {
  const rows = await db
    .select({
      listing: channelListings,
      item: inventoryItems,
      seller: sellerProfiles,
      image: inventoryItemImages,
      category: categories,
      score: listingScores,
    })
    .from(channelListings)
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .innerJoin(sellerProfiles, eq(inventoryItems.ownerId, sellerProfiles.userId))
    .leftJoin(
      inventoryItemImages,
      and(
        eq(inventoryItemImages.inventoryItemId, inventoryItems.id),
        eq(inventoryItemImages.isPrimary, true),
        eq(inventoryItemImages.status, "ready"),
      ),
    )
    .leftJoin(categories, eq(inventoryItems.categoryId, categories.id))
    .leftJoin(listingScores, eq(listingScores.channelListingId, channelListings.id))
    .where(eq(channelListings.id, listingId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Fetch all active listings for a specific seller (by userId).
 */
export async function fetchActiveListingsForSeller(userId: string): Promise<FullListingRow[]> {
  return db
    .select({
      listing: channelListings,
      item: inventoryItems,
      seller: sellerProfiles,
      image: inventoryItemImages,
      category: categories,
      score: listingScores,
    })
    .from(channelListings)
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .innerJoin(sellerProfiles, eq(inventoryItems.ownerId, sellerProfiles.userId))
    .leftJoin(
      inventoryItemImages,
      and(
        eq(inventoryItemImages.inventoryItemId, inventoryItems.id),
        eq(inventoryItemImages.isPrimary, true),
        eq(inventoryItemImages.status, "ready"),
      ),
    )
    .leftJoin(categories, eq(inventoryItems.categoryId, categories.id))
    .leftJoin(listingScores, eq(listingScores.channelListingId, channelListings.id))
    .where(
      and(
        eq(sellerProfiles.userId, userId),
        eq(channelListings.status, "active"),
        isNull(channelListings.hiddenAt),
      ),
    );
}

// ---------------------------------------------------------------------------
// Document builder
// ---------------------------------------------------------------------------

/** Build a flat MeiliSearch document from a joined listing row. */
export function buildListingDocument(row: FullListingRow): ListingDocument {
  const { listing, item, seller, image, category, score } = row;

  // U2-perf: browse/search cards render at ~160-240px wide, so serve the
  // card-800 variant instead of the full-resolution original (the join above
  // gates on status="ready", so the variant is guaranteed to exist).
  const primaryImageUrl =
    image?.storageKey ? cardOrOriginalUrl(image.storageKey) : null;

  const tags = (item.aiTags ?? []) as string[];

  const listingScore = score?.score ?? 0;
  const qualityTier = scoreToQualityTier(listingScore);

  return {
    id: listing.id,
    channelId: listing.channelId,
    title: listing.title,
    description: listing.description ?? item.description ?? null,
    handle: listing.handle,
    priceCents: listing.priceCents,
    currency: listing.currency,
    status: listing.status,
    brand: item.brand ?? null,
    size: item.size ?? null,
    colour: item.colour ?? null,
    condition: item.condition ?? null,
    categorySlug: category?.slug ?? null,
    tags,
    publishedAt: listing.publishedAt ? listing.publishedAt.getTime() : null,
    primaryImageUrl,
    seller: {
      id: seller.id,
      handle: seller.handle,
      storeName: seller.storeName,
      avatarUrl: seller.avatarUrl ?? null,
    },
    sellerStoreName: seller.storeName,
    listingScore,
    qualityTier,
  };
}

// ---------------------------------------------------------------------------
// Index setup
// ---------------------------------------------------------------------------

const PING_MAX_ATTEMPTS = 5;
const PING_BASE_DELAY_MS = 200;

/**
 * Ensure the MeiliSearch listings index exists and settings are applied.
 * Includes a retry/ping loop to handle slow container startup.
 * Awaits the settings task so callers know the index is fully configured.
 */
export async function setupListingsIndex(channelSlug: string): Promise<void> {
  const client = getMeiliClient();
  const indexName = getListingIndexName(channelSlug);

  // 1. Readiness ping loop
  for (let attempt = 1; attempt <= PING_MAX_ATTEMPTS; attempt++) {
    try {
      await client.health();
      break;
    } catch {
      if (attempt === PING_MAX_ATTEMPTS) {
        throw new Error(
          `MeiliSearch not reachable after ${PING_MAX_ATTEMPTS} attempts`,
        );
      }
      const delay = PING_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[search-index] MeiliSearch ping failed (attempt ${attempt}/${PING_MAX_ATTEMPTS}), retrying in ${delay}ms`,
      );
      await new Promise<void>((r) => setTimeout(r, delay));
    }
  }

  // 2. Get index reference (creates lazily on first write if not existing)
  const index = client.index<ListingDocument>(indexName);

  // 3. Apply settings and wait for the settings task to complete
  const settingsTask = await index.updateSettings(INDEX_SETTINGS).waitTask();

  console.info(
    `[search-index] Index "${indexName}" ready (settings task ${settingsTask.uid} complete)`,
  );
}

// ---------------------------------------------------------------------------
// Bootstrap / re-index
// ---------------------------------------------------------------------------

const REINDEX_BATCH_SIZE = 100;

/**
 * Re-index all active listings in batches.
 * Intended for: initial bootstrap and manual CLI runs only.
 * NOT called on every restart — gated by the bootstrap_completed flag.
 */
export async function reindexAllActiveListings(): Promise<void> {
  const client = getMeiliClient();

  const allRows = await db
    .select({
      listing: channelListings,
      item: inventoryItems,
      seller: sellerProfiles,
      image: inventoryItemImages,
      category: categories,
      score: listingScores,
    })
    .from(channelListings)
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .innerJoin(sellerProfiles, eq(inventoryItems.ownerId, sellerProfiles.userId))
    .leftJoin(
      inventoryItemImages,
      and(
        eq(inventoryItemImages.inventoryItemId, inventoryItems.id),
        eq(inventoryItemImages.isPrimary, true),
        eq(inventoryItemImages.status, "ready"),
      ),
    )
    .leftJoin(categories, eq(inventoryItems.categoryId, categories.id))
    .leftJoin(listingScores, eq(listingScores.channelListingId, channelListings.id))
    .where(
      and(
        eq(channelListings.status, "active"),
        isNotNull(channelListings.channelId),
        isNull(channelListings.hiddenAt),
      ),
    );

  if (allRows.length === 0) {
    console.info("[search-index] No active listings to re-index");
    return;
  }

  // Group by channelId to use the correct index per channel
  const byChannel = new Map<string, FullListingRow[]>();
  for (const row of allRows) {
    const channelId = row.listing.channelId;
    const existing = byChannel.get(channelId) ?? [];
    existing.push(row);
    byChannel.set(channelId, existing);
  }

  // Fetch channel slugs to build index names
  const channelRows = await db.select({ id: channelsTable.id, slug: channelsTable.slug }).from(channelsTable);
  const channelSlugById = new Map(channelRows.map((c) => [c.id, c.slug]));

  let totalIndexed = 0;

  for (const [channelId, rows] of byChannel) {
    const slug = channelSlugById.get(channelId);
    if (!slug) {
      console.warn(`[search-index] No slug found for channelId=${channelId}, skipping`);
      continue;
    }

    const indexName = getListingIndexName(slug);
    const index = client.index<ListingDocument>(indexName);
    const docs = rows.map(buildListingDocument);

    for (let i = 0; i < docs.length; i += REINDEX_BATCH_SIZE) {
      const batch = docs.slice(i, i + REINDEX_BATCH_SIZE);
      await index.addDocuments(batch, { primaryKey: "id" }).waitTask();
      totalIndexed += batch.length;
      console.info(
        `[search-index] Indexed batch (channelId=${channelId}, docs=${batch.length}, total=${totalIndexed})`,
      );
    }
  }

  console.info(`[search-index] Re-index complete — ${totalIndexed} listings indexed`);
}

// ---------------------------------------------------------------------------
// Stale queue purge (one-shot per bootstrap version)
// ---------------------------------------------------------------------------

/**
 * Purge stale completed/failed jobs from the marketplace-events queue.
 * Guarded by a versioned Redis flag so it only runs once per index config version.
 * Returns true if bootstrap ran, false if it was already done.
 */
export async function purgeStaleQueueEventsIfNeeded(channelSlug: string): Promise<boolean> {
  const redis = getRedis();
  const flagKey = getBootstrapFlagKey(channelSlug);

  const alreadyDone = await redis.get(flagKey);
  if (alreadyDone) {
    console.info("[search-index] Bootstrap flag set — skipping re-index and queue purge");
    return false;
  }

  // Run setup + re-index
  await setupListingsIndex(channelSlug);
  await reindexAllActiveListings();

  // Purge stale queue jobs
  const { Queue } = await import("bullmq");
  const queue = new Queue("marketplace-events", { connection: redis });
  await queue.clean(0, 0, "completed");
  await queue.clean(0, 0, "failed");
  await queue.close();

  // Set the versioned flag
  await redis.set(flagKey, "1");
  console.info(`[search-index] Bootstrap complete — flag set (${flagKey})`);

  return true;
}
