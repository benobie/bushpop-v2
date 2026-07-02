import { describe, it, expect, beforeEach } from "vitest";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { createTestInventoryItem } from "../../helpers/create-inventory-item.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";
import { publicRequest } from "../../helpers/http.js";
import { db } from "@bushpop/db/client";
import { channelListings } from "@bushpop/db/schema";

describe("Store Listings API (by ID)", () => {
  let userId: string;
  let channelId: string;

  beforeEach(async () => {
    const { user } = await signUpTestUser();
    userId = user.id;
    await grantSellerRole(userId);
    const channel = await getBushpopChannel();
    channelId = channel.id;
  });

  async function createActiveListing(suffix = "") {
    const item = await createTestInventoryItem(userId, { title: "Test Jacket" });

    const [listing] = await db
      .insert(channelListings)
      .values({
        inventoryItemId: item.id,
        channelId,
        title: "Test Jacket",
        priceCents: 4999,
        handle: `test-jacket-${Date.now()}${suffix}`,
        status: "active",
        publishedAt: new Date(),
      })
      .returning();

    return listing!;
  }

  describe("GET /api/v1/store/listings/:id", () => {
    it("returns an active listing by ULID with seller info", async () => {
      const listing = await createActiveListing();

      const res = await publicRequest("GET", `/api/v1/store/listings/${listing.id}`);
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.id).toBe(listing.id);
      expect(body.title).toBe("Test Jacket");
      expect(body.priceCents).toBe(4999);
      expect(body.status).toBe("active");
      expect(body.images).toBeInstanceOf(Array);
      expect(body.seller).not.toBeNull();
      expect(body.seller.handle).toBeDefined();
    });

    it("returns an active listing by handle", async () => {
      const listing = await createActiveListing("-h");

      const res = await publicRequest("GET", `/api/v1/store/listings/${listing.handle}`);
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(listing.id);
    });

    it("returns 404 for inactive (draft) listing", async () => {
      const item = await createTestInventoryItem(userId);
      const [draftListing] = await db
        .insert(channelListings)
        .values({
          inventoryItemId: item.id,
          channelId,
          title: "Draft Listing",
          priceCents: 1000,
          handle: `draft-${Date.now()}`,
          status: "draft",
        })
        .returning();

      const res = await publicRequest("GET", `/api/v1/store/listings/${draftListing!.id}`);
      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for archived listing", async () => {
      const item = await createTestInventoryItem(userId);
      const [archivedListing] = await db
        .insert(channelListings)
        .values({
          inventoryItemId: item.id,
          channelId,
          title: "Archived Listing",
          priceCents: 1000,
          handle: `archived-${Date.now()}`,
          status: "archived",
        })
        .returning();

      const res = await publicRequest("GET", `/api/v1/store/listings/${archivedListing!.id}`);
      expect(res.statusCode).toBe(404);
    });

    it("does not expose stripe or internal seller fields", async () => {
      const listing = await createActiveListing("-s");

      const res = await publicRequest("GET", `/api/v1/store/listings/${listing.id}`);
      const body = res.json();

      if (body.seller) {
        expect(body.seller).not.toHaveProperty("stripeAccountId");
        expect(body.seller).not.toHaveProperty("stripeChargesEnabled");
        expect(body.seller).not.toHaveProperty("userId");
      }
    });
  });
});
