/**
 * Listing Score Worker Tests
 *
 * Unit tests for pure scoring functions (no DB/Redis required):
 *   calcPhotoScore, calcDescriptionScore, calcCompletenessScore,
 *   calcCategoryScore, calcNudgeKey, scoreToTier
 *
 * Integration tests for processListingScoreJob (requires Postgres):
 *   - creates/updates listing_scores row with correct values
 *   - sends score_nudge notification when nudgeKey changes
 *   - dispatches listing_score.calculated event when listing is indexable
 *   - skips archived listings
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { SCORE_NUDGE_MESSAGES } from "@bushpop/config";
import { db } from "@bushpop/db/client";
import {
  inventoryItems,
  inventoryItemImages,
  channelListings,
  listingScores,
  categories,
} from "@bushpop/db/schema";
import {
  calcPhotoScore,
  calcDescriptionScore,
  calcCompletenessScore,
  calcCategoryScore,
  calcNudgeKey,
  scoreToTier,
  processListingScoreJob,
} from "../../../workers/listing-score.js";
import { createTestUser } from "../../helpers/create-user.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";

// ── Mock BullMQ queue (enqueueListingScore) and notification/event side-effects ──
// Prevents Redis connections during unit/integration tests.

const { hoistedEnqueueEmail, hoistedDispatchEvent } = vi.hoisted(() => ({
  hoistedEnqueueEmail: vi.fn().mockResolvedValue(undefined),
  hoistedDispatchEvent: vi.fn().mockResolvedValue("evt-mock-id"),
}));

vi.mock("../../../workers/email.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../workers/email.js")>();
  return {
    ...original,
    enqueueEmail: hoistedEnqueueEmail,
    startEmailWorker: vi.fn(),
  };
});

vi.mock("../../../lib/events.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../lib/events.js")>();
  return {
    ...original,
    dispatchEvent: hoistedDispatchEvent,
  };
});

// ── Unit tests: pure scoring functions ────────────────────────────────────────

describe("calcPhotoScore", () => {
  it("returns 0 for 0 images", () => {
    expect(calcPhotoScore(0)).toBe(0);
  });

  it("returns 8 for 1 image", () => {
    expect(calcPhotoScore(1)).toBe(8);
  });

  it("returns 16 for 2 images", () => {
    expect(calcPhotoScore(2)).toBe(16);
  });

  it("returns 25 for 3 images (full score)", () => {
    expect(calcPhotoScore(3)).toBe(25);
  });

  it("returns 25 for more than 3 images", () => {
    expect(calcPhotoScore(5)).toBe(25);
    expect(calcPhotoScore(10)).toBe(25);
  });
});

describe("calcDescriptionScore", () => {
  it("returns 0 for null", () => {
    expect(calcDescriptionScore(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(calcDescriptionScore(undefined)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(calcDescriptionScore("")).toBe(0);
  });

  it("returns 0 for whitespace-only string", () => {
    expect(calcDescriptionScore("   ")).toBe(0);
  });

  it("returns partial score for 15-word description", () => {
    const desc = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen";
    const score = calcDescriptionScore(desc);
    // 15/30 * 25 = 12.5 → rounded to 13
    expect(score).toBe(13);
  });

  it("returns 25 for exactly 30-word description (full score)", () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${i + 1}`).join(" ");
    expect(calcDescriptionScore(words)).toBe(25);
  });

  it("returns 25 for more than 30 words", () => {
    const words = Array.from({ length: 50 }, (_, i) => `word${i + 1}`).join(" ");
    expect(calcDescriptionScore(words)).toBe(25);
  });

  it("returns proportional score for short descriptions", () => {
    // 1 word: Math.round(1/30 * 25) = Math.round(0.833) = 1
    expect(calcDescriptionScore("hello")).toBe(1);
  });
});

describe("calcCompletenessScore", () => {
  it("returns 0 when both measurements and condition note absent", () => {
    expect(calcCompletenessScore(false, false)).toBe(0);
  });

  it("returns 13 for measurements only", () => {
    expect(calcCompletenessScore(true, false)).toBe(13);
  });

  it("returns 12 for condition note only", () => {
    expect(calcCompletenessScore(false, true)).toBe(12);
  });

  it("returns 25 for both measurements and condition note (full score)", () => {
    expect(calcCompletenessScore(true, true)).toBe(25);
  });
});

describe("calcCategoryScore", () => {
  it("returns 0 for null categoryId", () => {
    expect(calcCategoryScore(null)).toBe(0);
  });

  it("returns 0 for undefined categoryId", () => {
    expect(calcCategoryScore(undefined)).toBe(0);
  });

  it("returns 0 for empty string categoryId", () => {
    expect(calcCategoryScore("")).toBe(0);
  });

  it("returns 25 for a non-empty categoryId", () => {
    expect(calcCategoryScore("cat-123")).toBe(25);
    expect(calcCategoryScore("01HZXYZ")).toBe(25);
  });
});

describe("calcNudgeKey", () => {
  it("returns 'photo' when photo score is lowest", () => {
    // photo=0, others all higher
    expect(calcNudgeKey(0, 25, 25, 25)).toBe("photo");
  });

  it("returns 'description' when description score is lowest", () => {
    expect(calcNudgeKey(25, 0, 25, 25)).toBe("description");
  });

  it("returns 'completeness' when completeness score is lowest", () => {
    expect(calcNudgeKey(25, 25, 0, 25)).toBe("completeness");
  });

  it("returns 'category' when category score is lowest", () => {
    expect(calcNudgeKey(25, 25, 25, 0)).toBe("category");
  });

  it("tie-breaks to 'photo' when photo and description are equally lowest", () => {
    // photo and description both 0, others higher — photo wins tie
    expect(calcNudgeKey(0, 0, 25, 25)).toBe("photo");
  });

  it("tie-breaks to 'photo' when all scores are equal (all zero)", () => {
    expect(calcNudgeKey(0, 0, 0, 0)).toBe("photo");
  });

  it("tie-breaks to 'description' when description and completeness are equal and lowest (photo higher)", () => {
    // photo=25, description=0, completeness=0, category=25
    // description appears before completeness in array — description wins
    expect(calcNudgeKey(25, 0, 0, 25)).toBe("description");
  });

  it("tie-breaks to 'completeness' when completeness and category are equal and lowest", () => {
    // photo=25, description=25, completeness=0, category=0
    // completeness appears before category — completeness wins
    expect(calcNudgeKey(25, 25, 0, 0)).toBe("completeness");
  });
});

describe("scoreToTier", () => {
  it("returns 'bronze' for score below 50", () => {
    expect(scoreToTier(0)).toBe("bronze");
    expect(scoreToTier(49)).toBe("bronze");
  });

  it("returns 'silver' for score between 50 and 74 inclusive", () => {
    expect(scoreToTier(50)).toBe("silver");
    expect(scoreToTier(74)).toBe("silver");
  });

  it("returns 'gold' for score 75 and above", () => {
    expect(scoreToTier(75)).toBe("gold");
    expect(scoreToTier(100)).toBe("gold");
  });

  it("boundary: score 74 is silver, 75 is gold", () => {
    expect(scoreToTier(74)).toBe("silver");
    expect(scoreToTier(75)).toBe("gold");
  });
});

describe("SCORE_NUDGE_MESSAGES", () => {
  it("has entries for all four nudge keys", () => {
    expect(SCORE_NUDGE_MESSAGES["photo"]).toBeTruthy();
    expect(SCORE_NUDGE_MESSAGES["description"]).toBeTruthy();
    expect(SCORE_NUDGE_MESSAGES["completeness"]).toBeTruthy();
    expect(SCORE_NUDGE_MESSAGES["category"]).toBeTruthy();
  });
});

// ── Integration tests: processListingScoreJob ─────────────────────────────────

describe("processListingScoreJob", () => {
  let userId: string;

  beforeEach(async () => {
    hoistedEnqueueEmail.mockClear();
    hoistedDispatchEvent.mockClear();

    const user = await createTestUser();
    userId = user.id;
  });

  it("creates a listing_scores row with correct dimension scores for a bare listing", async () => {
    // Bare listing: 1 image (from createActiveTestListing), no description,
    // no size, no conditionNotes, no categoryId
    const listing = await createActiveTestListing(userId);

    await processListingScoreJob({ channelListingId: listing.id });

    const [scoreRow] = await db
      .select()
      .from(listingScores)
      .where(eq(listingScores.channelListingId, listing.id))
      .limit(1);

    expect(scoreRow).toBeDefined();
    // 1 ready image → photoScore=8
    expect(scoreRow!.photoScore).toBe(8);
    // no description → descriptionScore=0
    expect(scoreRow!.descriptionScore).toBe(0);
    // no size, no conditionNotes → completenessScore=0
    expect(scoreRow!.completenessScore).toBe(0);
    // no categoryId → categoryScore=0
    expect(scoreRow!.categoryScore).toBe(0);
    // total = 8
    expect(scoreRow!.score).toBe(8);
    expect(scoreRow!.scoreVersion).toBe("v1");
    expect(scoreRow!.scoredFromVersion).toBe(1);
    expect(scoreRow!.nudgeKey).toBe("description");
  });

  it("calculates a higher score for a well-filled listing", async () => {
    const listing = await createActiveTestListing(userId);

    // Insert a real category (categories have a FK constraint — can't use arbitrary strings)
    const [testCategory] = await db
      .insert(categories)
      .values({ name: "Tops", slug: `tops-${listing.id}` })
      .returning();

    // Enrich the inventory item with description, size, conditionNotes, categoryId
    const thirtyWords = Array.from({ length: 30 }, (_, i) => `word${i + 1}`).join(" ");
    await db
      .update(inventoryItems)
      .set({
        description: thirtyWords,
        size: "M",
        conditionNotes: "Very good condition, minor wear.",
        categoryId: testCategory!.id,
      })
      .where(eq(inventoryItems.id, listing.inventoryItemId));

    // Add 2 more ready images (total 3)
    await db.insert(inventoryItemImages).values([
      {
        inventoryItemId: listing.inventoryItemId,
        storageKey: `items/${listing.inventoryItemId}/img2.jpg`,
        status: "ready",
        confirmedAt: new Date(),
      },
      {
        inventoryItemId: listing.inventoryItemId,
        storageKey: `items/${listing.inventoryItemId}/img3.jpg`,
        status: "ready",
        confirmedAt: new Date(),
      },
    ]);

    await processListingScoreJob({ channelListingId: listing.id });

    const [scoreRow] = await db
      .select()
      .from(listingScores)
      .where(eq(listingScores.channelListingId, listing.id))
      .limit(1);

    expect(scoreRow).toBeDefined();
    expect(scoreRow!.photoScore).toBe(25);       // 3 images
    expect(scoreRow!.descriptionScore).toBe(25); // 30 words
    expect(scoreRow!.completenessScore).toBe(25); // size + conditionNotes
    expect(scoreRow!.categoryScore).toBe(25);    // categoryId set
    expect(scoreRow!.score).toBe(100);
  });

  it("upserts listing_scores on repeated calls (updates existing row)", async () => {
    const listing = await createActiveTestListing(userId);

    // First run — bare listing
    await processListingScoreJob({ channelListingId: listing.id });

    const [firstRow] = await db
      .select()
      .from(listingScores)
      .where(eq(listingScores.channelListingId, listing.id))
      .limit(1);

    expect(firstRow!.score).toBe(8);

    // Update the listing description and version, then run again
    const thirtyWords = Array.from({ length: 30 }, (_, i) => `word${i + 1}`).join(" ");
    await db
      .update(channelListings)
      .set({ description: thirtyWords, version: 2 })
      .where(eq(channelListings.id, listing.id));

    await processListingScoreJob({ channelListingId: listing.id });

    // Check the score updated (not a second row)
    const allRows = await db
      .select()
      .from(listingScores)
      .where(eq(listingScores.channelListingId, listing.id));

    expect(allRows).toHaveLength(1);
    expect(allRows[0]!.score).toBe(33); // 8 + 25
    expect(allRows[0]!.descriptionScore).toBe(25);
    expect(allRows[0]!.scoredFromVersion).toBe(2);
  });

  it("sends score_nudge notification when nudgeKey changes on second run", async () => {
    const listing = await createActiveTestListing(userId);

    // First run — inserts the row with some nudgeKey (previousNudgeKey is null → no notification)
    await processListingScoreJob({ channelListingId: listing.id });
    expect(hoistedEnqueueEmail).not.toHaveBeenCalled();

    // Change the listing so nudgeKey shifts after the description gap is fixed
    const thirtyWords = Array.from({ length: 30 }, (_, i) => `word${i + 1}`).join(" ");
    await db
      .update(channelListings)
      .set({ description: thirtyWords, version: 2 })
      .where(eq(channelListings.id, listing.id));

    hoistedEnqueueEmail.mockClear();

    // Second run — nudgeKey changes
    await processListingScoreJob({ channelListingId: listing.id });

    // enqueueEmail is called by sendNotification internally — nudge sent
    expect(hoistedEnqueueEmail).toHaveBeenCalledTimes(1);
    expect(hoistedEnqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: "score_nudge" }),
    );
  });

  it("does NOT send notification on first score (no previousNudgeKey)", async () => {
    const listing = await createActiveTestListing(userId);

    await processListingScoreJob({ channelListingId: listing.id });

    // No prior nudgeKey → notification is NOT sent on first insert
    expect(hoistedEnqueueEmail).not.toHaveBeenCalled();
  });

  it("does NOT send notification when the nudgeKey stays the same", async () => {
    const listing = await createActiveTestListing(userId);

    await processListingScoreJob({ channelListingId: listing.id });
    hoistedEnqueueEmail.mockClear();

    await db
      .update(channelListings)
      .set({ title: "Renamed Listing", version: 2 })
      .where(eq(channelListings.id, listing.id));

    await processListingScoreJob({ channelListingId: listing.id });

    expect(hoistedEnqueueEmail).not.toHaveBeenCalled();
  });

  it("dispatches listing_score.calculated event for active listing", async () => {
    const listing = await createActiveTestListing(userId);

    await processListingScoreJob({ channelListingId: listing.id });

    // shouldIndexListing returns true for active listings → event dispatched
    expect(hoistedDispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "listing_score.calculated",
        entityId: listing.id,
        channelId: listing.channelId,
      }),
    );
  });

  it("skips archived listings without creating a score row", async () => {
    const listing = await createActiveTestListing(userId);

    // Archive the listing
    await db
      .update(channelListings)
      .set({ status: "archived" })
      .where(eq(channelListings.id, listing.id));

    await processListingScoreJob({ channelListingId: listing.id });

    const rows = await db
      .select()
      .from(listingScores)
      .where(eq(listingScores.channelListingId, listing.id));

    expect(rows).toHaveLength(0);
    expect(hoistedDispatchEvent).not.toHaveBeenCalled();
  });

  it("no-ops gracefully for a non-existent channelListingId", async () => {
    // Should not throw — returns early when row not found
    await expect(
      processListingScoreJob({ channelListingId: "01HZNONEXISTENTLISTINGID" }),
    ).resolves.toBeUndefined();
  });

  it("does not let a stale listing version overwrite a newer score", async () => {
    const listing = await createActiveTestListing(userId);
    const thirtyWords = Array.from({ length: 30 }, (_, i) => `word${i + 1}`).join(" ");

    await processListingScoreJob({ channelListingId: listing.id });

    await db
      .update(channelListings)
      .set({ description: thirtyWords, version: 2 })
      .where(eq(channelListings.id, listing.id));

    await processListingScoreJob({ channelListingId: listing.id });

    await db
      .update(channelListings)
      .set({ description: null, version: 1 })
      .where(eq(channelListings.id, listing.id));

    await processListingScoreJob({ channelListingId: listing.id });

    const [scoreRow] = await db
      .select()
      .from(listingScores)
      .where(eq(listingScores.channelListingId, listing.id))
      .limit(1);

    expect(scoreRow!.score).toBe(33);
    expect(scoreRow!.descriptionScore).toBe(25);
    expect(scoreRow!.scoredFromVersion).toBe(2);
  });
});
