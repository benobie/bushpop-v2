import { describe, it, expect, vi, beforeEach } from "vitest";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { authedRequest } from "../../helpers/http.js";
import { db } from "@bushpop/db/client";
import { sellerProfiles, marketplaceEvents } from "@bushpop/db/schema";
import { eq } from "drizzle-orm";
import { getMeiliClient } from "../../../lib/meilisearch.js";
import { getListingIndexName, setupListingsIndex } from "../../../lib/search-index.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { clearListingsIndex, indexTestListing } from "../../helpers/index-listing.js";

// Mock R2 — inline factory to avoid Vitest hoisting issues with imported helpers
vi.mock("../../../lib/r2.js", () => ({
  getR2Client: vi.fn(),
  isAllowedContentType: vi.fn((ct: string) =>
    ["image/jpeg", "image/png", "image/webp"].includes(ct),
  ),
  getExtensionForContentType: vi.fn((ct: string) => {
    const map: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    return map[ct] ?? "bin";
  }),
  createPresignedPutUrl: vi.fn(async () => "https://r2.example.com/presigned-put-url"),
  headObject: vi.fn(async () => ({
    contentType: "image/jpeg",
    contentLength: 123456,
  })),
  deleteObject: vi.fn(async () => {}),
}));

const CHANNEL_SLUG = "piklo";

describe("Seller Profile API", () => {
  let sessionToken: string;
  let userId: string;

  beforeEach(async () => {
    const { user, sessionToken: token } = await signUpTestUser();
    userId = user.id;
    sessionToken = token;
    await grantSellerRole(userId);
  });

  describe("GET /api/v1/seller/profile", () => {
    it("returns own seller profile", async () => {
      const res = await authedRequest(sessionToken, "GET", "/api/v1/seller/profile");
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.userId).toBe(userId);
      expect(body.storeName).toBe("Test Store");
      expect(body.vacationMode).toBe(false);
    });

    it("returns 401 without auth", async () => {
      const { getTestApp } = await import("../../helpers/http.js");
      const app = await getTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/seller/profile",
        headers: { "x-channel": "piklo" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("PATCH /api/v1/seller/profile", () => {
    it("updates bio without dispatching search event", async () => {
      const res = await authedRequest(sessionToken, "PATCH", "/api/v1/seller/profile", {
        bio: "I sell vintage fashion",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.bio).toBe("I sell vintage fashion");

      // Bio is not search-relevant — no event should be dispatched
      const events = await db
        .select()
        .from(marketplaceEvents)
        .where(eq(marketplaceEvents.eventName, "seller_profile.updated"));
      expect(events).toHaveLength(0);
    });

    it("updates storeName and dispatches seller_profile.updated event", async () => {
      const res = await authedRequest(sessionToken, "PATCH", "/api/v1/seller/profile", {
        storeName: "My Boutique",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.storeName).toBe("My Boutique");

      // storeName is search-relevant — event should be dispatched
      const events = await db
        .select()
        .from(marketplaceEvents)
        .where(eq(marketplaceEvents.eventName, "seller_profile.updated"));
      expect(events).toHaveLength(1);
      expect(events[0]?.entityId).toBe(userId);
    });

    it("returns 409 when handle is already taken", async () => {
      // Create another seller with a specific handle
      const { user: user2 } = await signUpTestUser({ email: "seller2@example.com" });
      await grantSellerRole(user2.id);
      const [profile2] = await db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, user2.id));

      const res = await authedRequest(sessionToken, "PATCH", "/api/v1/seller/profile", {
        handle: profile2!.handle,
      });
      expect(res.statusCode).toBe(409);
    });

    it("updates vacationMode without dispatching search event", async () => {
      const res = await authedRequest(sessionToken, "PATCH", "/api/v1/seller/profile", {
        vacationMode: true,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().vacationMode).toBe(true);

      const events = await db
        .select()
        .from(marketplaceEvents)
        .where(eq(marketplaceEvents.eventName, "seller_profile.updated"));
      expect(events).toHaveLength(0);
    });
  });

  describe("POST /api/v1/seller/profile/avatar/upload-url", () => {
    it("returns a presigned upload URL", async () => {
      const res = await authedRequest(
        sessionToken,
        "POST",
        "/api/v1/seller/profile/avatar/upload-url",
        { contentType: "image/jpeg" },
      );
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.uploadUrl).toContain("r2.example.com");
      expect(body.storageKey).toMatch(/^avatars\//);
      expect(body.expiresIn).toBe(300);
    });

    it("rejects unsupported content type", async () => {
      const res = await authedRequest(
        sessionToken,
        "POST",
        "/api/v1/seller/profile/avatar/upload-url",
        { contentType: "image/gif" },
      );
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/v1/seller/profile/avatar/confirm", () => {
    it("confirms avatar and updates profile", async () => {
      const [profile] = await db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId));
      const storageKey = `avatars/${profile!.id}.jpg`;

      const res = await authedRequest(
        sessionToken,
        "POST",
        "/api/v1/seller/profile/avatar/confirm",
        { storageKey },
      );
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.avatarUrl).toBeDefined();
      expect(typeof body.avatarUrl).toBe("string");
    });
  });

  describe("storeName change → search re-index flow", () => {
    it("updated storeName is reflected in MeiliSearch after re-index", async () => {
      // Set up MeiliSearch index
      await setupListingsIndex(CHANNEL_SLUG);
      await clearListingsIndex(CHANNEL_SLUG);

      // Create an active listing and index it
      const listing = await createActiveTestListing(userId);
      await indexTestListing(listing.id, CHANNEL_SLUG);

      const client = getMeiliClient();
      const index = client.index(getListingIndexName(CHANNEL_SLUG));

      // Verify initial storeName in index using direct document fetch
      const before = await index.getDocument(listing.id) as Record<string, unknown>;
      expect(before.sellerStoreName).toBe("Test Store");

      // Update storeName via API
      const patchRes = await authedRequest(sessionToken, "PATCH", "/api/v1/seller/profile", {
        storeName: "New Name Boutique",
      });
      expect(patchRes.statusCode).toBe(200);

      // Simulate search-sync re-index (worker not running in tests)
      const { processSearchSyncJob } = await import("../../../workers/search-sync.js");
      await processSearchSyncJob({
        id: "test-job",
        data: {
          eventId: "evt-test",
          eventName: "seller_profile.updated",
          category: "profiles",
          entityId: userId,
        },
      } as unknown as Parameters<typeof processSearchSyncJob>[0]);

      // Verify updated storeName in index
      const after = await index.getDocument(listing.id) as Record<string, unknown>;
      expect(after.sellerStoreName).toBe("New Name Boutique");
    });
  });
});
