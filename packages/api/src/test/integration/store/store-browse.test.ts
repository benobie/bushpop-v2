import { describe, it, expect, beforeEach } from "vitest";
import { signUpTestUser } from "../../helpers/auth.js";
import { createTestSeller } from "../../helpers/create-seller.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { indexTestListing, clearListingsIndex } from "../../helpers/index-listing.js";
import { publicRequest } from "../../helpers/http.js";
import { setupListingsIndex } from "../../../lib/search-index.js";

const CHANNEL_SLUG = "bushpop";

describe("Store Browse API", () => {
  let userId: string;

  beforeEach(async () => {
    await setupListingsIndex(CHANNEL_SLUG);
    await clearListingsIndex(CHANNEL_SLUG);

    const { user } = await signUpTestUser();
    userId = user.id;
    await createTestSeller(userId);
  });

  describe("GET /api/v1/store/listings", () => {
    it("returns an empty page when no listings are indexed", async () => {
      const res = await publicRequest("GET", "/api/v1/store/listings");
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(0);
      expect(body.total).toBe(0);
      expect(body.hasMore).toBe(false);
    });

    it("returns listing cards for indexed active listings", async () => {
      const listing = await createActiveTestListing(userId, { title: "Vintage Jacket", priceCents: 4500 });
      await indexTestListing(listing.id, CHANNEL_SLUG);

      const res = await publicRequest("GET", "/api/v1/store/listings");
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(listing.id);
      expect(body.items[0].title).toBe("Vintage Jacket");
      expect(body.items[0].priceCents).toBe(4500);
      expect(body.items[0].seller).toBeDefined();
      expect(body.hasMore).toBe(false);
    });

    it("respects limit and offset", async () => {
      // Create 3 listings
      const l1 = await createActiveTestListing(userId, { title: "Item A", priceCents: 1000 });
      const l2 = await createActiveTestListing(userId, { title: "Item B", priceCents: 2000 });
      const l3 = await createActiveTestListing(userId, { title: "Item C", priceCents: 3000 });
      await indexTestListing(l1.id, CHANNEL_SLUG);
      await indexTestListing(l2.id, CHANNEL_SLUG);
      await indexTestListing(l3.id, CHANNEL_SLUG);

      const res = await publicRequest("GET", "/api/v1/store/listings?limit=2&offset=0");
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(3);
      expect(body.hasMore).toBe(true);
      expect(body.limit).toBe(2);
      expect(body.offset).toBe(0);
    });

    it("filters by price range", async () => {
      const cheap = await createActiveTestListing(userId, { title: "Cheap Item", priceCents: 500 });
      const expensive = await createActiveTestListing(userId, { title: "Expensive Item", priceCents: 10000 });
      await indexTestListing(cheap.id, CHANNEL_SLUG);
      await indexTestListing(expensive.id, CHANNEL_SLUG);

      const res = await publicRequest("GET", "/api/v1/store/listings?maxPrice=1000");
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(cheap.id);
    });

    it("sorts by price_asc", async () => {
      const l1 = await createActiveTestListing(userId, { priceCents: 3000 });
      const l2 = await createActiveTestListing(userId, { priceCents: 1000 });
      const l3 = await createActiveTestListing(userId, { priceCents: 2000 });
      await indexTestListing(l1.id, CHANNEL_SLUG);
      await indexTestListing(l2.id, CHANNEL_SLUG);
      await indexTestListing(l3.id, CHANNEL_SLUG);

      const res = await publicRequest("GET", "/api/v1/store/listings?sort=price_asc");
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const prices = body.items.map((i: { priceCents: number }) => i.priceCents);
      expect(prices).toEqual([1000, 2000, 3000]);
    });

    it("rejects invalid sort value with 400", async () => {
      const res = await publicRequest("GET", "/api/v1/store/listings?sort=invalid");
      expect(res.statusCode).toBe(400);
    });
  });
});
