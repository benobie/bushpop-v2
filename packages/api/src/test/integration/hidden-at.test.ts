import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { channelListings } from "@bushpop/db/schema";
import { getMeiliClient } from "../../lib/meilisearch.js";
import {
  shouldIndexListing,
  getListingIndexName,
  setupListingsIndex,
  reindexAllActiveListings,
} from "../../lib/search-index.js";
import { processSearchSyncJob } from "../../workers/search-sync.js";
import { signUpTestUser, grantSellerRole } from "../helpers/auth.js";
import { createActiveTestListing } from "../helpers/create-listing.js";
import { clearListingsIndex, indexTestListing } from "../helpers/index-listing.js";
import { publicRequest } from "../helpers/http.js";
import type { Job } from "bullmq";

const CHANNEL_SLUG = "piklo";

function makeJob(data: {
  eventName: string;
  entityId?: string;
  channelId?: string;
  category?: string;
  metadata?: Record<string, unknown>;
}): Job {
  return {
    id: "test-job-hidden-at",
    data: {
      eventId: "evt-hidden-at",
      eventName: data.eventName,
      category: data.category ?? "listings",
      entityId: data.entityId,
      channelId: data.channelId,
      metadata: data.metadata ?? {},
    },
  } as unknown as Job;
}

async function documentExists(listingId: string): Promise<boolean> {
  try {
    const client = getMeiliClient();
    const index = client.index(getListingIndexName(CHANNEL_SLUG));
    await index.getDocument(listingId);
    return true;
  } catch {
    return false;
  }
}

describe("hidden_at foundation", () => {
  let userId: string;

  beforeEach(async () => {
    await setupListingsIndex(CHANNEL_SLUG);
    await clearListingsIndex(CHANNEL_SLUG);

    const { user } = await signUpTestUser();
    userId = user.id;
    await grantSellerRole(userId, { withDefaultAddress: true });
  });

  // -------------------------------------------------------------------------
  // 1. Store query excludes hidden listings
  // -------------------------------------------------------------------------
  describe("store query excludes hidden listings", () => {
    it("returns 404 for a hidden listing by handle", async () => {
      const listing = await createActiveTestListing(userId);

      // Visible — should return 200
      const visibleRes = await publicRequest("GET", `/api/v1/store/listings/${listing.handle}`);
      expect(visibleRes.statusCode).toBe(200);

      // Hide the listing
      await db
        .update(channelListings)
        .set({ hiddenAt: new Date() })
        .where(eq(channelListings.id, listing.id));

      // Hidden — should return 404
      const hiddenRes = await publicRequest("GET", `/api/v1/store/listings/${listing.handle}`);
      expect(hiddenRes.statusCode).toBe(404);

      // Unhide — should return 200 again
      await db
        .update(channelListings)
        .set({ hiddenAt: null })
        .where(eq(channelListings.id, listing.id));

      const restoredRes = await publicRequest("GET", `/api/v1/store/listings/${listing.handle}`);
      expect(restoredRes.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // 2. shouldIndexListing predicate
  // -------------------------------------------------------------------------
  describe("shouldIndexListing", () => {
    it("returns true when hiddenAt is null", () => {
      expect(shouldIndexListing({ hiddenAt: null })).toBe(true);
    });

    it("returns false when hiddenAt is set", () => {
      expect(shouldIndexListing({ hiddenAt: new Date() })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 3. visibility_changed event triggers MeiliSearch delete
  // -------------------------------------------------------------------------
  describe("listing.visibility_changed", () => {
    it("removes a hidden listing from MeiliSearch", async () => {
      const listing = await createActiveTestListing(userId);

      // Index the listing
      await indexTestListing(listing.id, CHANNEL_SLUG);
      expect(await documentExists(listing.id)).toBe(true);

      // Hide the listing in DB
      await db
        .update(channelListings)
        .set({ hiddenAt: new Date() })
        .where(eq(channelListings.id, listing.id));

      // Dispatch visibility_changed
      await processSearchSyncJob(
        makeJob({
          eventName: "listing.visibility_changed",
          entityId: listing.id,
          channelId: listing.channelId,
        }),
      );

      expect(await documentExists(listing.id)).toBe(false);
    });

    it("re-indexes a listing when visibility is restored", async () => {
      const listing = await createActiveTestListing(userId);

      // Hide and process — should not be in index
      await db
        .update(channelListings)
        .set({ hiddenAt: new Date() })
        .where(eq(channelListings.id, listing.id));

      await processSearchSyncJob(
        makeJob({
          eventName: "listing.visibility_changed",
          entityId: listing.id,
          channelId: listing.channelId,
        }),
      );

      expect(await documentExists(listing.id)).toBe(false);

      // Unhide and process — should re-appear
      await db
        .update(channelListings)
        .set({ hiddenAt: null })
        .where(eq(channelListings.id, listing.id));

      await processSearchSyncJob(
        makeJob({
          eventName: "listing.visibility_changed",
          entityId: listing.id,
          channelId: listing.channelId,
        }),
      );

      expect(await documentExists(listing.id)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 4. reindexAllActiveListings skips hidden
  // -------------------------------------------------------------------------
  describe("reindexAllActiveListings", () => {
    it("only indexes visible listings", async () => {
      const visible = await createActiveTestListing(userId, { title: "Visible Item" });
      const hidden = await createActiveTestListing(userId, { title: "Hidden Item" });

      // Hide one listing
      await db
        .update(channelListings)
        .set({ hiddenAt: new Date() })
        .where(eq(channelListings.id, hidden.id));

      await reindexAllActiveListings();

      expect(await documentExists(visible.id)).toBe(true);
      expect(await documentExists(hidden.id)).toBe(false);
    });
  });
});
