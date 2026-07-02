import { describe, it, expect, beforeEach } from "vitest";
import { signUpTestUser } from "../../helpers/auth.js";
import { createTestSeller } from "../../helpers/create-seller.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { indexTestListing, clearListingsIndex } from "../../helpers/index-listing.js";
import { publicRequest } from "../../helpers/http.js";
import { setupListingsIndex } from "../../../lib/search-index.js";

const CHANNEL_SLUG = "bushpop";

describe("Store Search API", () => {
  let userId: string;

  beforeEach(async () => {
    await setupListingsIndex(CHANNEL_SLUG);
    await clearListingsIndex(CHANNEL_SLUG);

    const { user } = await signUpTestUser();
    userId = user.id;
    await createTestSeller(userId);
  });

  describe("GET /api/v1/store/search", () => {
    it("requires a q parameter", async () => {
      const res = await publicRequest("GET", "/api/v1/store/search");
      expect(res.statusCode).toBe(400);
    });

    it("returns matching listings for a text query", async () => {
      const jacket = await createActiveTestListing(userId, { title: "Vintage Denim Jacket" });
      const shirt = await createActiveTestListing(userId, { title: "Hawaiian Shirt" });
      await indexTestListing(jacket.id, CHANNEL_SLUG);
      await indexTestListing(shirt.id, CHANNEL_SLUG);

      const res = await publicRequest("GET", "/api/v1/store/search?q=jacket");
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const ids = body.items.map((i: { id: string }) => i.id);
      expect(ids).toContain(jacket.id);
    });

    it("returns paginated results with hasMore", async () => {
      // Create several listings
      for (let i = 0; i < 3; i++) {
        const listing = await createActiveTestListing(userId, { title: `Test Item ${i}` });
        await indexTestListing(listing.id, CHANNEL_SLUG);
      }

      const res = await publicRequest("GET", "/api/v1/store/search?q=test&limit=2&offset=0");
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(3);
      expect(body.hasMore).toBe(true);
    });

    it("returns 200 with empty results for no match", async () => {
      const listing = await createActiveTestListing(userId, { title: "Denim Jacket" });
      await indexTestListing(listing.id, CHANNEL_SLUG);

      const res = await publicRequest("GET", "/api/v1/store/search?q=zzznomatch999");
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(0);
      expect(body.total).toBe(0);
      expect(body.hasMore).toBe(false);
    });

    it("response shape includes all StoreListingCard fields", async () => {
      const listing = await createActiveTestListing(userId, { title: "Canvas Tote" });
      await indexTestListing(listing.id, CHANNEL_SLUG);

      const res = await publicRequest("GET", "/api/v1/store/search?q=canvas");
      expect(res.statusCode).toBe(200);
      const body = res.json();
      if (body.items.length > 0) {
        const card = body.items[0];
        expect(card).toHaveProperty("id");
        expect(card).toHaveProperty("title");
        expect(card).toHaveProperty("handle");
        expect(card).toHaveProperty("priceCents");
        expect(card).toHaveProperty("currency");
        expect(card).toHaveProperty("seller");
        expect(card.seller).toHaveProperty("id");
        expect(card.seller).toHaveProperty("handle");
        expect(card.seller).toHaveProperty("storeName");
      }
    });
  });
});
