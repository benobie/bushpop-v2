import { Queue, Worker } from "bullmq";
import { and, count, eq, lt, ne, or } from "drizzle-orm";
import {
  computeListingStrength,
  LISTING_STRENGTH_VERSION,
  SCORE_NUDGE_MESSAGES,
  scoreToQualityTier,
  strengthComponentToNudgeKey,
  STRENGTH_MAX_POINTS,
  type StrengthComponentKey,
} from "@bushpop/config";
import { db } from "@bushpop/db/client";
import {
  channelListings,
  inventoryItems,
  inventoryItemImages,
  listingScores,
} from "@bushpop/db/schema";
import { dispatchEvent } from "../lib/events.js";
import { sendNotification } from "../lib/notification-service.js";
import { getRedis } from "../lib/redis.js";
import { shouldIndexListing } from "../lib/search-index.js";
import { buildStrengthInput, resolveCategoryInfo } from "../lib/strength-input.js";

export const LISTING_SCORE_QUEUE = "listing-score";
export { SCORE_NUDGE_MESSAGES };

let scoreQueue: Queue | null = null;

export interface ListingScoreJobData {
  channelListingId: string;
}

class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

export function getListingScoreQueue(): Queue {
  if (!scoreQueue) {
    scoreQueue = new Queue(LISTING_SCORE_QUEUE, {
      connection: getRedis(),
    });
  }

  return scoreQueue;
}

/**
 * Strength v3 (task 7): scoring is delegated to the shared
 * `computeListingStrength` module in @bushpop/config (D10) — the same
 * function the drafts API and the web wizard use, so scores are identical
 * client/server by construction. This worker adds only persistence, nudge
 * mapping and event fan-out.
 */

/** Core components eligible for nudges — bonuses (rrp/offers) excluded. */
const NUDGE_ELIGIBLE: readonly StrengthComponentKey[] = [
  "photos",
  "title",
  "brand",
  "category",
  "size",
  "colour",
  "description",
  "condition",
  "measurements",
  "price",
];

/**
 * Pick the nudge for a v3 breakdown: the core component with the most
 * points still on the table (first wins ties, in rubric order), mapped onto
 * the existing 4-key nudge vocabulary so notification types are unchanged.
 */
export function strengthNudgeKey(
  breakdown: Record<string, number>,
): keyof typeof SCORE_NUDGE_MESSAGES {
  let worst: StrengthComponentKey = NUDGE_ELIGIBLE[0]!;
  let worstDeficit = -1;
  for (const component of NUDGE_ELIGIBLE) {
    const deficit = STRENGTH_MAX_POINTS[component] - (breakdown[component] ?? 0);
    if (deficit > worstDeficit) {
      worstDeficit = deficit;
      worst = component;
    }
  }
  return strengthComponentToNudgeKey(worst);
}

export const scoreToTier = scoreToQualityTier;

export async function processListingScoreJob(
  data: ListingScoreJobData,
): Promise<void> {
  const { channelListingId } = data;

  const [row] = await db
    .select({
      listing: channelListings,
      item: inventoryItems,
    })
    .from(channelListings)
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .where(eq(channelListings.id, channelListingId))
    .limit(1);

  if (!row) return;

  const { listing, item } = row;
  if (listing.status === "archived") return;
  if (!item.ownerId) {
    throw new NonRetryableError(`Listing ${channelListingId} is missing an owner`);
  }

  const [imageCountRow] = await db
    .select({ count: count() })
    .from(inventoryItemImages)
    .where(
      and(
        eq(inventoryItemImages.inventoryItemId, listing.inventoryItemId),
        eq(inventoryItemImages.status, "ready"),
      ),
    );

  const imageCount = imageCountRow?.count ?? 0;

  // Published listings carry canonical title/description/price on the
  // channel_listings row — overlay them onto the item before scoring.
  const category = await resolveCategoryInfo(item.categoryId);
  const strength = computeListingStrength(
    buildStrengthInput(
      {
        ...item,
        title: listing.title ?? item.title,
        description: listing.description ?? item.description,
        askingPriceCents: listing.priceCents ?? item.askingPriceCents,
      },
      imageCount,
      category,
    ),
  );

  const { score, breakdown } = strength;
  // Legacy dimension columns kept for API compatibility, mapped from v3.
  const photoScore = breakdown.photos;
  const descriptionScore = breakdown.description;
  const completenessScore = breakdown.condition + breakdown.measurements;
  const categoryScore = breakdown.category;
  const qualityTier = scoreToTier(score);
  const nudgeKey = strengthNudgeKey(breakdown);

  let previousNudgeKey: string | null = null;
  const wroteFreshScore = await db.transaction(async (tx) => {
    const [existingScore] = await tx
      .select({ nudgeKey: listingScores.nudgeKey })
      .from(listingScores)
      .where(eq(listingScores.channelListingId, channelListingId))
      .limit(1);

    previousNudgeKey = existingScore?.nudgeKey ?? null;

    const rows = await tx
      .insert(listingScores)
      .values({
        channelListingId,
        score,
        photoScore,
        descriptionScore,
        completenessScore,
        categoryScore,
        breakdown,
        nudgeKey,
        scoredFromVersion: listing.version,
        scoreVersion: LISTING_STRENGTH_VERSION,
      })
      .onConflictDoUpdate({
        target: listingScores.channelListingId,
        set: {
          score,
          photoScore,
          descriptionScore,
          completenessScore,
          categoryScore,
          breakdown,
          nudgeKey,
          scoredFromVersion: listing.version,
          scoreVersion: LISTING_STRENGTH_VERSION,
          updatedAt: new Date(),
        },
        // Fresh version wins; a rubric-version change (v1 → v3 backfill)
        // also overwrites even when the listing version is unchanged.
        setWhere: or(
          lt(listingScores.scoredFromVersion, listing.version),
          ne(listingScores.scoreVersion, LISTING_STRENGTH_VERSION),
        ),
      })
      .returning({ id: listingScores.id });

    return rows.length > 0;
  });

  if (!wroteFreshScore) {
    return;
  }

  // A perfect score has nothing to nudge — without this, completing the
  // last missing field fires an "add more photos" nudge (the tie-break
  // fallback of strengthNudgeKey) at the exact moment the listing hits 100.
  if (score < 100 && previousNudgeKey !== null && previousNudgeKey !== nudgeKey) {
    const nudgeMessage = SCORE_NUDGE_MESSAGES[nudgeKey];
    await sendNotification(
      item.ownerId,
      listing.channelId,
      "score_nudge",
      "promotional",
      {
        channelListingId,
        nudgeKey,
        nudgeMessage,
        score,
        qualityTier,
      },
      channelListingId,
    ).catch((err: unknown) => {
      console.error(
        `[listing-score] Failed to send score_nudge notification for listing ${channelListingId}:`,
        err,
      );
    });
  }

  if (shouldIndexListing(listing)) {
    await dispatchEvent({
      eventName: "listing_score.calculated",
      category: "listings",
      entityType: "channel_listing",
      entityId: channelListingId,
      channelId: listing.channelId,
      metadata: {
        score,
        qualityTier,
        nudgeKey,
      },
    }).catch((err: unknown) => {
      console.error(
        `[listing-score] Failed to dispatch listing_score.calculated for listing ${channelListingId}:`,
        err,
      );
    });
  }

  console.info(
    `[listing-score] Scored listing ${channelListingId}: ${score}/100 (${qualityTier}) nudge=${nudgeKey}`,
  );
}

export async function enqueueListingScore(channelListingId: string): Promise<void> {
  await getListingScoreQueue().add(
    "score-listing",
    { channelListingId },
    {
      jobId: `score-${channelListingId}`,
      removeOnComplete: true,
      removeOnFail: { count: 10 },
    },
  );
}

export function startListingScoreWorker(): Worker {
  const worker = new Worker<ListingScoreJobData>(
    LISTING_SCORE_QUEUE,
    async (job) => {
      try {
        await processListingScoreJob(job.data);
      } catch (err) {
        if (err instanceof NonRetryableError) {
          console.error(
            `[listing-score] Non-retryable error for ${job.data.channelListingId}:`,
            err.message,
          );
          return;
        }

        throw err;
      }
    },
    {
      connection: getRedis(),
      concurrency: 5,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[listing-score] Job ${job?.id} failed:`,
      err.message,
    );
  });

  return worker;
}
