/**
 * Listing Score Worker Tests — strength v3 (task 7).
 *
 * Scoring itself is the shared computeListingStrength module
 * (unit-tested in test/unit/listing-strength.test.ts). These tests cover
 * the worker's wiring: overlay of listing fields, breakdown persistence,
 * scoreVersion v3, legacy dimension mapping, nudge mapping, upsert
 * semantics (incl. v1 → v3 rescoring), notifications and events.
 *
 * v3 maths for the bare createActiveTestListing fixture:
 *   1 photo (5) + title "Test Listing" (10) + condition "good" (10) +
 *   price 5000c (10) = 35. Largest deficit = photos (15) → nudge "photo".
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
  strengthNudgeKey,
  scoreToTier,
  processListingScoreJob,
} from "../../../workers/listing-score.js";
import { createTestUser } from "../../helpers/create-user.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";

// ── Mock notification/event side-effects (prevents Redis connections) ──

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

// ── Unit tests: nudge mapping + tiers ──

describe("strengthNudgeKey", () => {
  const complete = {
    photos: 20, title: 10, brand: 5, category: 10, size: 10, colour: 5,
    description: 10, condition: 10, measurements: 10, price: 10,
  };

  it("maps the largest missing core component onto the 4-key vocabulary", () => {
    expect(strengthNudgeKey({ ...complete, photos: 0 })).toBe("photo");
    expect(strengthNudgeKey({ ...complete, description: 0 })).toBe("description");
    expect(strengthNudgeKey({ ...complete, category: 0 })).toBe("category");
    expect(strengthNudgeKey({ ...complete, measurements: 0 })).toBe("completeness");
    expect(strengthNudgeKey({ ...complete, size: 0 })).toBe("completeness");
  });

  it("ignores rrp/offers bonuses", () => {
    expect(strengthNudgeKey({ ...complete, photos: 15, rrp: 0, offers: 0 })).toBe("photo");
  });

  it("photos wins the everything-missing tie (largest deficit)", () => {
    expect(strengthNudgeKey({})).toBe("photo");
  });
});

describe("scoreToTier", () => {
  it("bronze < 50 ≤ silver < 75 ≤ gold", () => {
    expect(scoreToTier(49)).toBe("bronze");
    expect(scoreToTier(50)).toBe("silver");
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

// ── Integration tests: processListingScoreJob ──

describe("processListingScoreJob", () => {
  let userId: string;

  beforeEach(async () => {
    hoistedEnqueueEmail.mockClear();
    hoistedDispatchEvent.mockClear();

    const user = await createTestUser();
    userId = user.id;
  });

  it("scores a bare listing with the v3 rubric and persists the breakdown", async () => {
    const listing = await createActiveTestListing(userId);

    await processListingScoreJob({ channelListingId: listing.id });

    const [scoreRow] = await db
      .select()
      .from(listingScores)
      .where(eq(listingScores.channelListingId, listing.id))
      .limit(1);

    expect(scoreRow).toBeDefined();
    // 1 photo (5) + title (10) + condition (10) + price (10) = 35
    expect(scoreRow!.score).toBe(35);
    expect(scoreRow!.scoreVersion).toBe("v3");
    expect(scoreRow!.scoredFromVersion).toBe(1);
    expect(scoreRow!.breakdown).toMatchObject({
      photos: 5,
      title: 10,
      condition: 10,
      price: 10,
      brand: 0,
      category: 0,
      description: 0,
    });
    // Legacy dimension mapping
    expect(scoreRow!.photoScore).toBe(5);
    expect(scoreRow!.descriptionScore).toBe(0);
    expect(scoreRow!.completenessScore).toBe(10); // condition 10 + measurements 0
    expect(scoreRow!.categoryScore).toBe(0);
    // Largest deficit = photos (15 missing)
    expect(scoreRow!.nudgeKey).toBe("photo");
  });

  it("scores a well-filled listing higher (overlaying item fields)", async () => {
    const listing = await createActiveTestListing(userId);

    const [testCategory] = await db
      .insert(categories)
      .values({ name: "Tops", slug: `tops-${listing.id.toLowerCase()}` })
      .returning();

    await db
      .update(inventoryItems)
      .set({
        description:
          "Classic tee in soft cotton, relaxed fit, no marks or pilling anywhere.",
        size: "M",
        brand: "adidas",
        colour: "black",
        measurements: { chest: 55, length: 70 },
        categoryId: testCategory!.id,
      })
      .where(eq(inventoryItems.id, listing.inventoryItemId));

    // 3 more ready images (total 4 → full photo points)
    await db.insert(inventoryItemImages).values(
      [2, 3, 4].map((n) => ({
        inventoryItemId: listing.inventoryItemId,
        storageKey: `items/${listing.inventoryItemId}/img${n}.jpg`,
        status: "ready",
        confirmedAt: new Date(),
      })),
    );

    await processListingScoreJob({ channelListingId: listing.id });

    const [scoreRow] = await db
      .select()
      .from(listingScores)
      .where(eq(listingScores.channelListingId, listing.id))
      .limit(1);

    // photos 20 + title 10 + brand 5 + category 10 + size 10 + colour 5 +
    // description 10 + condition 10 + measurements 10 + price 10 = 100
    expect(scoreRow!.score).toBe(100);
    expect(scoreRow!.breakdown!.measurements).toBe(10);
    expect(scoreRow!.completenessScore).toBe(20);
  });

  it("upserts on repeated calls (updates the single existing row)", async () => {
    const listing = await createActiveTestListing(userId);

    await processListingScoreJob({ channelListingId: listing.id });

    const longDescription =
      "Vintage denim jacket with a soft broken-in feel, brass buttons intact.";
    await db
      .update(channelListings)
      .set({ description: longDescription, version: 2 })
      .where(eq(channelListings.id, listing.id));

    await processListingScoreJob({ channelListingId: listing.id });

    const allRows = await db
      .select()
      .from(listingScores)
      .where(eq(listingScores.channelListingId, listing.id));

    expect(allRows).toHaveLength(1);
    expect(allRows[0]!.score).toBe(45); // 35 + description 10
    expect(allRows[0]!.descriptionScore).toBe(10);
    expect(allRows[0]!.scoredFromVersion).toBe(2);
  });

  it("rescopes a v1 row to v3 even when the listing version is unchanged (backfill)", async () => {
    const listing = await createActiveTestListing(userId);

    // Simulate a leftover v1 score for the same listing version
    await db.insert(listingScores).values({
      channelListingId: listing.id,
      score: 8,
      photoScore: 8,
      descriptionScore: 0,
      completenessScore: 0,
      categoryScore: 0,
      nudgeKey: "description",
      scoredFromVersion: 1,
      scoreVersion: "v1",
    });

    await processListingScoreJob({ channelListingId: listing.id });

    const [scoreRow] = await db
      .select()
      .from(listingScores)
      .where(eq(listingScores.channelListingId, listing.id))
      .limit(1);

    expect(scoreRow!.scoreVersion).toBe("v3");
    expect(scoreRow!.score).toBe(35);
    expect(scoreRow!.breakdown).not.toBeNull();
  });

  it("sends score_nudge notification when nudgeKey changes", async () => {
    const listing = await createActiveTestListing(userId);

    // First run — nudge = photo (largest deficit); no notification on insert
    await processListingScoreJob({ channelListingId: listing.id });
    expect(hoistedEnqueueEmail).not.toHaveBeenCalled();

    // Fix photos: add 3 ready images → largest deficit shifts to category
    await db.insert(inventoryItemImages).values(
      [2, 3, 4].map((n) => ({
        inventoryItemId: listing.inventoryItemId,
        storageKey: `items/${listing.inventoryItemId}/img${n}.jpg`,
        status: "ready",
        confirmedAt: new Date(),
      })),
    );
    await db
      .update(channelListings)
      .set({ version: 2 })
      .where(eq(channelListings.id, listing.id));

    hoistedEnqueueEmail.mockClear();
    await processListingScoreJob({ channelListingId: listing.id });

    expect(hoistedEnqueueEmail).toHaveBeenCalledTimes(1);
    expect(hoistedEnqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: "score_nudge" }),
    );

    const [scoreRow] = await db
      .select()
      .from(listingScores)
      .where(eq(listingScores.channelListingId, listing.id))
      .limit(1);
    expect(scoreRow!.nudgeKey).toBe("category");
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
    await expect(
      processListingScoreJob({ channelListingId: "01HZNONEXISTENTLISTINGID" }),
    ).resolves.toBeUndefined();
  });

  it("does not let a stale listing version overwrite a newer score", async () => {
    const listing = await createActiveTestListing(userId);
    const longDescription =
      "Vintage denim jacket with a soft broken-in feel, brass buttons intact.";

    await processListingScoreJob({ channelListingId: listing.id });

    await db
      .update(channelListings)
      .set({ description: longDescription, version: 2 })
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

    expect(scoreRow!.score).toBe(45);
    expect(scoreRow!.descriptionScore).toBe(10);
    expect(scoreRow!.scoredFromVersion).toBe(2);
  });
});
