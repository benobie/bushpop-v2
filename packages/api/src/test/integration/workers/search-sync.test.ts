import { describe, it, expect, beforeEach } from "vitest";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { channelListings, listingScores } from "@bushpop/db/schema";
import { getMeiliClient } from "../../../lib/meilisearch.js";
import { getListingIndexName, setupListingsIndex } from "../../../lib/search-index.js";
import { processSearchSyncJob } from "../../../workers/search-sync.js";
import { signUpTestUser } from "../../helpers/auth.js";
import { createTestSeller } from "../../helpers/create-seller.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { clearListingsIndex, indexTestListing } from "../../helpers/index-listing.js";

const CHANNEL_SLUG = "bushpop";

function makeJob(data: {
  eventId?: string;
  eventName: string;
  category?: string;
  entityId?: string;
  channelId?: string;
  metadata?: Record<string, unknown>;
}): Job {
  return {
    id: "test-job-1",
    data: {
      eventId: data.eventId ?? "evt-1",
      eventName: data.eventName,
      category: data.category ?? "listings",
      entityId: data.entityId,
      channelId: data.channelId,
      metadata: data.metadata ?? {},
    },
  } as unknown as Job;
}

/** Check if a document with the given id exists in the index. */
async function documentExists(listingId: string, channelSlug = CHANNEL_SLUG): Promise<boolean> {
  try {
    const client = getMeiliClient();
    const index = client.index(getListingIndexName(channelSlug));
    await index.getDocument(listingId);
    return true;
  } catch {
    return false;
  }
}

describe("processSearchSyncJob", () => {
  let userId: string;

  beforeEach(async () => {
    // Set up MeiliSearch index and clear it between tests
    await setupListingsIndex(CHANNEL_SLUG);
    await clearListingsIndex(CHANNEL_SLUG);

    const { user } = await signUpTestUser();
    userId = user.id;
    await createTestSeller(userId);
  });

  it("no-ops for unhandled event types", async () => {
    // Should not throw
    await processSearchSyncJob(
      makeJob({ eventName: "order.created", category: "orders" }),
    );
  });

  describe("channel_listing.created", () => {
    it("upserts an active listing to the index", async () => {
      const listing = await createActiveTestListing(userId);

      // Ensure not in index yet
      expect(await documentExists(listing.id)).toBe(false);

      await processSearchSyncJob(
        makeJob({
          eventName: "channel_listing.created",
          entityId: listing.id,
          channelId: listing.channelId,
        }),
      );

      expect(await documentExists(listing.id)).toBe(true);

      // Verify document shape
      const client = getMeiliClient();
      const doc = await client.index(getListingIndexName(CHANNEL_SLUG)).getDocument(listing.id);
      expect((doc as Record<string, unknown>).title).toBe(listing.title);
    });

    it("acks (no error) when listing not found in DB", async () => {
      await expect(
        processSearchSyncJob(
          makeJob({
            eventName: "channel_listing.created",
            entityId: "01NONEXISTENT000000000000",
            channelId: "01NONEXISTENTCHAN00000000",
          }),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe("channel_listing.status_changed", () => {
    it("removes a non-active listing from the index", async () => {
      const listing = await createActiveTestListing(userId);

      // First index it
      await indexTestListing(listing.id, CHANNEL_SLUG);
      expect(await documentExists(listing.id)).toBe(true);

      // Update status to draft in DB
      const { db } = await import("@bushpop/db/client");
      const { channelListings } = await import("@bushpop/db/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(channelListings)
        .set({ status: "draft" })
        .where(eq(channelListings.id, listing.id));

      await processSearchSyncJob(
        makeJob({
          eventName: "channel_listing.status_changed",
          entityId: listing.id,
          channelId: listing.channelId,
        }),
      );

      expect(await documentExists(listing.id)).toBe(false);
    });
  });

  describe("channel_listing.archived", () => {
    it("removes an archived listing from the index", async () => {
      const listing = await createActiveTestListing(userId);

      // First index it
      await indexTestListing(listing.id, CHANNEL_SLUG);
      expect(await documentExists(listing.id)).toBe(true);

      await processSearchSyncJob(
        makeJob({
          eventName: "channel_listing.archived",
          entityId: listing.id,
          channelId: listing.channelId,
        }),
      );

      expect(await documentExists(listing.id)).toBe(false);
    });
  });

  describe("seller_profile.updated", () => {
    it("re-indexes all active listings for the seller", async () => {
      const listing1 = await createActiveTestListing(userId, { title: "Item One" });
      const listing2 = await createActiveTestListing(userId, { title: "Item Two" });

      // Initially not indexed
      expect(await documentExists(listing1.id)).toBe(false);
      expect(await documentExists(listing2.id)).toBe(false);

      await processSearchSyncJob(
        makeJob({
          eventName: "seller_profile.updated",
          entityId: userId, // entityId = userId for seller events
          category: "profiles",
        }),
      );

      expect(await documentExists(listing1.id)).toBe(true);
      expect(await documentExists(listing2.id)).toBe(true);
    });
  });

  describe("listing_score.calculated", () => {
    it("re-indexes the listing with listingScore and qualityTier", async () => {
      const listing = await createActiveTestListing(userId);

      await db.insert(listingScores).values({
        channelListingId: listing.id,
        score: 75,
        photoScore: 25,
        descriptionScore: 25,
        completenessScore: 25,
        categoryScore: 0,
        nudgeKey: "category",
        scoredFromVersion: listing.version,
      });

      await processSearchSyncJob(
        makeJob({
          eventName: "listing_score.calculated",
          entityId: listing.id,
          channelId: listing.channelId,
        }),
      );

      const client = getMeiliClient();
      const doc = await client.index(getListingIndexName(CHANNEL_SLUG)).getDocument(listing.id);
      expect((doc as Record<string, unknown>).listingScore).toBe(75);
      expect((doc as Record<string, unknown>).qualityTier).toBe("gold");
    });

    it("does not re-index a hidden listing", async () => {
      const listing = await createActiveTestListing(userId);

      await db
        .update(channelListings)
        .set({ hiddenAt: new Date() })
        .where(eq(channelListings.id, listing.id));

      await db.insert(listingScores).values({
        channelListingId: listing.id,
        score: 60,
        photoScore: 25,
        descriptionScore: 25,
        completenessScore: 10,
        categoryScore: 0,
        nudgeKey: "category",
        scoredFromVersion: listing.version,
      });

      await processSearchSyncJob(
        makeJob({
          eventName: "listing_score.calculated",
          entityId: listing.id,
          channelId: listing.channelId,
        }),
      );

      expect(await documentExists(listing.id)).toBe(false);
    });
  });
});
