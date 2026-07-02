import { Queue, Worker } from "bullmq";
import { and, count, eq, lt } from "drizzle-orm";
import {
  LISTING_SCORE_VERSION,
  SCORE_NUDGE_MESSAGES,
  scoreToQualityTier,
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

export function calcPhotoScore(imageCount: number): number {
  if (imageCount >= 3) return 25;
  if (imageCount === 2) return 16;
  if (imageCount === 1) return 8;
  return 0;
}

export function calcDescriptionScore(description: string | null | undefined): number {
  if (!description) return 0;

  const wordCount = description.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount >= 30) return 25;

  return Math.round((wordCount / 30) * 25);
}

export function calcCompletenessScore(
  hasMeasurements: boolean,
  hasConditionNote: boolean,
): number {
  let score = 0;
  if (hasMeasurements) score += 13;
  if (hasConditionNote) score += 12;
  return score;
}

export function calcCategoryScore(categoryId: string | null | undefined): number {
  return categoryId ? 25 : 0;
}

export function calcNudgeKey(
  photoScore: number,
  descriptionScore: number,
  completenessScore: number,
  categoryScore: number,
): keyof typeof SCORE_NUDGE_MESSAGES {
  const dimensions: Array<{ key: keyof typeof SCORE_NUDGE_MESSAGES; score: number }> = [
    { key: "photo", score: photoScore },
    { key: "description", score: descriptionScore },
    { key: "completeness", score: completenessScore },
    { key: "category", score: categoryScore },
  ];

  let lowest = dimensions[0]!;
  for (const dimension of dimensions.slice(1)) {
    if (dimension.score < lowest.score) {
      lowest = dimension;
    }
  }

  return lowest.key;
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
  const photoScore = calcPhotoScore(imageCount);
  const descriptionScore = calcDescriptionScore(listing.description ?? item.description);
  const hasMeasurements = !!item.size;
  const hasConditionNote = !!(item.conditionNotes && item.conditionNotes.trim().length > 0);
  const completenessScore = calcCompletenessScore(hasMeasurements, hasConditionNote);
  const categoryScore = calcCategoryScore(item.categoryId);
  const score = photoScore + descriptionScore + completenessScore + categoryScore;
  const qualityTier = scoreToTier(score);
  const nudgeKey = calcNudgeKey(
    photoScore,
    descriptionScore,
    completenessScore,
    categoryScore,
  );

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
        nudgeKey,
        scoredFromVersion: listing.version,
        scoreVersion: LISTING_SCORE_VERSION,
      })
      .onConflictDoUpdate({
        target: listingScores.channelListingId,
        set: {
          score,
          photoScore,
          descriptionScore,
          completenessScore,
          categoryScore,
          nudgeKey,
          scoredFromVersion: listing.version,
          scoreVersion: LISTING_SCORE_VERSION,
          updatedAt: new Date(),
        },
        setWhere: lt(listingScores.scoredFromVersion, listing.version),
      })
      .returning({ id: listingScores.id });

    return rows.length > 0;
  });

  if (!wroteFreshScore) {
    return;
  }

  if (previousNudgeKey !== null && previousNudgeKey !== nudgeKey) {
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
