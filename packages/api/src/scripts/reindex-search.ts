/**
 * Manually rebuild the MeiliSearch listings index from Postgres.
 *
 * Search-sync is event-driven (packages/api/src/workers/search-sync.ts) — it
 * only reacts to listing/seller change events, so bulk DB edits made outside
 * the API (seed scripts, direct SQL) never reach the index on their own. Run
 * this after reseeding or backfilling columns (e.g. inventory_items.category_id)
 * that MeiliSearch filters on.
 *
 * Usage:
 *   DATABASE_URL=... REDIS_URL=... MEILISEARCH_HOST=... MEILI_MASTER_KEY=... \
 *     pnpm --filter @bushpop/api tsx src/scripts/reindex-search.ts
 */

import { setupListingsIndex, reindexAllActiveListings } from "../lib/search-index.js";
import { db } from "@bushpop/db/client";
import { channels } from "@bushpop/db/schema";

async function main() {
  const channelRows = await db.select({ slug: channels.slug }).from(channels);

  for (const { slug } of channelRows) {
    console.log(`[reindex-search] Ensuring index settings for channel "${slug}"...`);
    await setupListingsIndex(slug);
  }

  console.log("[reindex-search] Reindexing all active listings...");
  await reindexAllActiveListings();
  console.log("[reindex-search] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[reindex-search] Fatal error:", err);
  process.exit(1);
});
