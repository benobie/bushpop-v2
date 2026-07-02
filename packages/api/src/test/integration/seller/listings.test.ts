import { describe, it, expect, beforeEach } from "vitest";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { createTestInventoryItem } from "../../helpers/create-inventory-item.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { getPikloChannel } from "../../helpers/get-channel.js";
import { authedRequest } from "../../helpers/http.js";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { channelListings, inventoryItemImages, inventoryItems, listingScores } from "@bushpop/db/schema";

describe("Seller Listings API", () => {
  let sessionToken: string;
  let userId: string;
  let channelId: string;

  beforeEach(async () => {
    const { user, sessionToken: token } = await signUpTestUser();
    userId = user.id;
    sessionToken = token;
    // withDefaultAddress: true sets the Tier-1 seller readiness (shipping address)
    // so activation tests pass. Individual tests that check readiness failures
    // override this in their own setup.
    await grantSellerRole(userId, { withDefaultAddress: true });
    const channel = await getPikloChannel();
    channelId = channel.id;
  });

  describe("POST /api/v1/seller/listings", () => {
    it("creates a draft listing", async () => {
      const item = await createTestInventoryItem(userId);

      const res = await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
        inventoryItemId: item.id,
        channelId,
        title: "Vintage Jacket",
        priceCents: 5000,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe("draft");
      expect(body.title).toBe("Vintage Jacket");
      expect(body.priceCents).toBe(5000);
      expect(body.handle).toBeDefined();
      expect(body.currency).toBe("AUD");
    });

    it("returns 409 on duplicate (item, channel)", async () => {
      const item = await createTestInventoryItem(userId);

      await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
        inventoryItemId: item.id,
        channelId,
        title: "First Listing",
        priceCents: 5000,
      });

      const res = await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
        inventoryItemId: item.id,
        channelId,
        title: "Duplicate Listing",
        priceCents: 6000,
      });

      expect(res.statusCode).toBe(409);
    });

    it("auto-generates handle when not provided", async () => {
      const item = await createTestInventoryItem(userId);

      const res = await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
        inventoryItemId: item.id,
        channelId,
        title: "My Cool Jacket",
        priceCents: 5000,
      });

      const body = res.json();
      expect(body.handle).toMatch(/^my-cool-jacket-/);
    });

    it("returns 404 for non-owned item", async () => {
      const { user: other } = await signUpTestUser({ email: "other@test.com" });
      await grantSellerRole(other.id, { handle: "other-seller" });
      const item = await createTestInventoryItem(other.id);

      const res = await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
        inventoryItemId: item.id,
        channelId,
        title: "Stolen Listing",
        priceCents: 5000,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /api/v1/seller/listings/:id/status", () => {
    it("rejects draft → active when item lifecycle is owned (not for_sale)", async () => {
      const item = await createTestInventoryItem(userId); // default: owned

      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
        inventoryItemId: item.id,
        channelId,
        title: "Test",
        priceCents: 5000,
      });
      const listing = createRes.json();

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/listings/${listing.id}/status`,
        { to: "active", version: 1 },
      );

      expect(res.statusCode).toBe(422);
    });

    it("rejects draft → active when item has no ready images", async () => {
      const item = await createTestInventoryItem(userId, { lifecycleState: "for_sale" });

      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
        inventoryItemId: item.id,
        channelId,
        title: "Test",
        priceCents: 5000,
      });
      const listing = createRes.json();

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/listings/${listing.id}/status`,
        { to: "active", version: 1 },
      );

      expect(res.statusCode).toBe(422);
    });

    it("allows draft → active with for_sale lifecycle + ready image", async () => {
      const item = await createTestInventoryItem(userId, { lifecycleState: "for_sale" });

      // Insert a ready image directly
      await db.insert(inventoryItemImages).values({
        inventoryItemId: item.id,
        storageKey: "items/test/test.jpg",
        status: "ready",
        confirmedAt: new Date(),
      });

      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
        inventoryItemId: item.id,
        channelId,
        title: "Active Listing",
        priceCents: 5000,
      });
      const listing = createRes.json();

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/listings/${listing.id}/status`,
        { to: "active", version: 1 },
      );

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("active");
      expect(body.publishedAt).toBeDefined();
    });

    it("returns 409 on version mismatch", async () => {
      const item = await createTestInventoryItem(userId, { lifecycleState: "for_sale" });
      await db.insert(inventoryItemImages).values({
        inventoryItemId: item.id,
        storageKey: "items/test/test2.jpg",
        status: "ready",
        confirmedAt: new Date(),
      });

      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
        inventoryItemId: item.id,
        channelId,
        title: "Test",
        priceCents: 5000,
      });
      const listing = createRes.json();

      // First transition succeeds
      await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/listings/${listing.id}/status`,
        { to: "active", version: 1 },
      );

      // Stale version fails
      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/listings/${listing.id}/status`,
        { to: "paused", version: 1 },
      );

      expect(res.statusCode).toBe(409);
    });

    it("rejects paused → active when listing is hidden by moderation", async () => {
      const item = await createTestInventoryItem(userId, { lifecycleState: "for_sale" });
      await db.insert(inventoryItemImages).values({
        inventoryItemId: item.id,
        storageKey: "items/test/hidden.jpg",
        status: "ready",
        confirmedAt: new Date(),
      });

      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
        inventoryItemId: item.id,
        channelId,
        title: "Hidden Listing",
        priceCents: 5000,
      });
      const listing = createRes.json();

      const activateRes = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/listings/${listing.id}/status`,
        { to: "active", version: 1 },
      );
      expect(activateRes.statusCode).toBe(200);

      const pauseRes = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/listings/${listing.id}/status`,
        { to: "paused", version: 2 },
      );
      expect(pauseRes.statusCode).toBe(200);

      await db
        .update(channelListings)
        .set({ hiddenAt: new Date() })
        .where(eq(channelListings.id, listing.id));

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/listings/${listing.id}/status`,
        { to: "active", version: 3 },
      );

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({
        error: "CONFLICT",
        message: "Listing is hidden by moderation and cannot be published",
      });
    });

    it("rejects draft → active when item is reserved", async () => {
      const item = await createTestInventoryItem(userId, { lifecycleState: "for_sale" });
      await db.insert(inventoryItemImages).values({
        inventoryItemId: item.id,
        storageKey: "items/test/reserved.jpg",
        status: "ready",
        confirmedAt: new Date(),
      });

      // Set availability to reserved (simulating a hold from another channel)
      await db
        .update(inventoryItems)
        .set({ availabilityStatus: "reserved" })
        .where(eq(inventoryItems.id, item.id));

      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
        inventoryItemId: item.id,
        channelId,
        title: "Reserved Item Listing",
        priceCents: 5000,
      });
      const listing = createRes.json();

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/listings/${listing.id}/status`,
        { to: "active", version: 1 },
      );

      expect(res.statusCode).toBe(422);
    });

    it("returns 404 for non-owned listing status change", async () => {
      const { user: otherUser, sessionToken: otherToken } = await signUpTestUser({ email: "other-status@test.com" });
      await grantSellerRole(otherUser.id, { handle: "other-status-seller" });
      const item = await createTestInventoryItem(otherUser.id);

      const createRes = await authedRequest(otherToken, "POST", "/api/v1/seller/listings", {
        inventoryItemId: item.id,
        channelId,
        title: "Other's Listing",
        priceCents: 5000,
      });
      const listing = createRes.json();

      // Try to transition someone else's listing
      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/listings/${listing.id}/status`,
        { to: "active", version: 1 },
      );

      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for non-owned listing metadata update", async () => {
      const { user: otherUser, sessionToken: otherToken } = await signUpTestUser({ email: "other-meta@test.com" });
      await grantSellerRole(otherUser.id, { handle: "other-meta-seller" });
      const item = await createTestInventoryItem(otherUser.id);

      const createRes = await authedRequest(otherToken, "POST", "/api/v1/seller/listings", {
        inventoryItemId: item.id,
        channelId,
        title: "Other's Listing",
        priceCents: 5000,
      });
      const listing = createRes.json();

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/listings/${listing.id}`,
        { title: "Hijacked Title", version: 1 },
      );

      expect(res.statusCode).toBe(404);
    });
  });

  describe("Lifecycle cascade", () => {
    it("auto-pauses active listing when item transitions to inventory_only", async () => {
      const item = await createTestInventoryItem(userId, { lifecycleState: "for_sale" });
      await db.insert(inventoryItemImages).values({
        inventoryItemId: item.id,
        storageKey: "items/test/cascade.jpg",
        status: "ready",
        confirmedAt: new Date(),
      });

      // Create and activate listing
      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/seller/listings", {
        inventoryItemId: item.id,
        channelId,
        title: "Cascade Test",
        priceCents: 5000,
      });
      const listing = createRes.json();

      await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/listings/${listing.id}/status`,
        { to: "active", version: 1 },
      );

      // Transition item to inventory_only → should cascade
      await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/inventory/${item.id}/lifecycle`,
        { to: "inventory_only", version: 1 },
      );

      // Check listing was paused
      const getRes = await authedRequest(
        sessionToken,
        "GET",
        `/api/v1/seller/listings/${listing.id}`,
      );
      expect(getRes.json().status).toBe("paused");
    });
  });

  describe("GET /api/v1/seller/listings/:id/score", () => {
    it("returns score details for the seller's own listing", async () => {
      const listing = await createActiveTestListing(userId, { channelId });

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

      const res = await authedRequest(
        sessionToken,
        "GET",
        `/api/v1/seller/listings/${listing.id}/score`,
      );

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        score: 75,
        photoScore: 25,
        descriptionScore: 25,
        completenessScore: 25,
        categoryScore: 0,
        qualityTier: "gold",
        nudgeKey: "category",
      });
    });

    it("returns 403 for another seller's listing", async () => {
      const { user: otherUser } = await signUpTestUser({ email: "other-score@test.com" });
      await grantSellerRole(otherUser.id, { handle: "other-score-seller", withDefaultAddress: true });
      const listing = await createActiveTestListing(otherUser.id, { channelId });

      const res = await authedRequest(
        sessionToken,
        "GET",
        `/api/v1/seller/listings/${listing.id}/score`,
      );

      expect(res.statusCode).toBe(403);
    });
  });
});
