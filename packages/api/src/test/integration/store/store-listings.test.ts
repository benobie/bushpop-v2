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

    it("includes PDP fields (condition/size/colour/brand/measurements/categorySlug/shippingOptions) — U1 §2.1", async () => {
      const item = await createTestInventoryItem(userId, {
        title: "Vintage Denim Jacket",
        condition: "like_new",
        size: "M",
        colour: "Blue",
        brand: "Levi's",
        measurements: { chest: 52, length: 68 },
        shippingOption: "prepaid",
      });

      const [listing] = await db
        .insert(channelListings)
        .values({
          inventoryItemId: item.id,
          channelId,
          title: "Vintage Denim Jacket",
          priceCents: 7500,
          handle: `denim-jacket-${Date.now()}`,
          status: "active",
          publishedAt: new Date(),
        })
        .returning();

      const res = await publicRequest("GET", `/api/v1/store/listings/${listing!.id}`);
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.condition).toBe("like_new");
      expect(body.size).toBe("M");
      expect(body.colour).toBe("Blue");
      expect(body.brand).toBe("Levi's");
      expect(body.measurements).toEqual({ chest: 52, length: 68 });
      expect(body.shippingOptions).toEqual(["prepaid"]);
      // No category assigned in this fixture — categorySlug is null, not omitted.
      expect(body).toHaveProperty("categorySlug", null);
    });

    it("defaults shippingOptions to buyer_pays for legacy NULL shipping_option", async () => {
      const item = await createTestInventoryItem(userId, { title: "Legacy Listing" });
      const [listing] = await db
        .insert(channelListings)
        .values({
          inventoryItemId: item.id,
          channelId,
          title: "Legacy Listing",
          priceCents: 3000,
          handle: `legacy-${Date.now()}`,
          status: "active",
          publishedAt: new Date(),
        })
        .returning();

      const res = await publicRequest("GET", `/api/v1/store/listings/${listing!.id}`);
      expect(res.json().shippingOptions).toEqual(["buyer_pays"]);
    });

    it("drops malformed (non-numeric) measurements entries instead of 500ing", async () => {
      const item = await createTestInventoryItem(userId, {
        title: "Malformed Measurements Listing",
        // Cast past the type: simulates a manually-edited/legacy row with a
        // non-numeric value that the app-level Zod validation never caught.
        measurements: { chest: 52, waist: "N/A" } as unknown as Record<string, number>,
      });
      const [listing] = await db
        .insert(channelListings)
        .values({
          inventoryItemId: item.id,
          channelId,
          title: "Malformed Measurements Listing",
          priceCents: 3000,
          handle: `malformed-measurements-${Date.now()}`,
          status: "active",
          publishedAt: new Date(),
        })
        .returning();

      const res = await publicRequest("GET", `/api/v1/store/listings/${listing!.id}`);
      expect(res.statusCode).toBe(200);
      expect(res.json().measurements).toEqual({ chest: 52 });
    });
  });
});
