/**
 * Backfill listing scores for all active channel_listings.
 *
 * Usage:
 *   DATABASE_URL=... REDIS_URL=... pnpm tsx src/scripts/backfill-listing-scores.ts
 */

import { isNull, eq, and } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { channelListings } from "@bushpop/db/schema";
import { enqueueListingScore } from "../workers/listing-score.js";

const BATCH_SIZE = 50;

async function main() {
  console.log("[backfill] Querying active channel_listings with hidden_at IS NULL...");

  const listings = await db
    .select({ id: channelListings.id })
    .from(channelListings)
    .where(and(eq(channelListings.status, "active"), isNull(channelListings.hiddenAt)));

  const total = listings.length;
  console.log(`[backfill] Found ${total} listing(s) to enqueue.`);

  let enqueued = 0;

  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map((listing) =>
        enqueueListingScore(listing.id).catch((err: unknown) => {
          console.error(`[backfill] Failed to enqueue listing ${listing.id}:`, err);
        }),
      ),
    );

    enqueued += batch.length;
    console.log(`[backfill] Enqueued ${enqueued}/${total} listings...`);
  }

  console.log(`[backfill] Done. Enqueued ${enqueued} listing-score jobs.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] Fatal error:", err);
  process.exit(1);
});
