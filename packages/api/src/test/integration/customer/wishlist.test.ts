import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@bushpop/db/client";
import { channelListings, inventoryItemImages } from "@bushpop/db/schema";
import { grantSellerRole, signUpTestUser } from "../../helpers/auth.js";
import { createTestInventoryItem } from "../../helpers/create-inventory-item.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";
import { authedRequest } from "../../helpers/http.js";

describe("Customer Wishlist API", () => {
  let buyerToken: string;
  let sellerId: string;
  let channelId: string;

  beforeEach(async () => {
    const buyer = await signUpTestUser();
    buyerToken = buyer.sessionToken;

    const seller = await signUpTestUser();
    sellerId = seller.user.id;
    await grantSellerRole(sellerId, { storeName: "Wishlist Seller" });

    const channel = await getBushpopChannel();
    channelId = channel.id;
  });

  async function createWishlistListing(overrides?: {
    inventoryTitle?: string;
    listingTitle?: string;
    priceCents?: number;
    status?: string;
    hiddenAt?: Date | null;
    withPrimaryImage?: boolean;
  }) {
    const item = await createTestInventoryItem(sellerId, {
      title: overrides?.inventoryTitle ?? "Inventory Wishlist Title",
      lifecycleState: "for_sale",
    });

    if (overrides?.withPrimaryImage !== false) {
      await db.insert(inventoryItemImages).values({
        inventoryItemId: item.id,
        storageKey: `items/${item.id}/primary.jpg`,
        status: "ready",
        isPrimary: true,
        confirmedAt: new Date(),
      });
    }

    const [listing] = await db
      .insert(channelListings)
      .values({
        inventoryItemId: item.id,
        channelId,
        title: overrides?.listingTitle ?? "Channel Listing Title",
        priceCents: overrides?.priceCents ?? 5000,
        currency: "AUD",
        handle: `wishlist-${ulid().slice(-10).toLowerCase()}`,
        status: overrides?.status ?? "active",
        publishedAt: overrides?.status === "active" || overrides?.status === undefined
          ? new Date()
          : null,
        hiddenAt: overrides?.hiddenAt ?? null,
      })
      .returning();

    return listing!;
  }

  async function waitForDistinctCursorOrder() {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  it("adds a listing to the wishlist", async () => {
    const listing = await createWishlistListing({
      inventoryTitle: "Structured Wool Coat",
      priceCents: 12345,
    });

    const res = await authedRequest(buyerToken, "POST", "/api/v1/customer/wishlist", {
      listingId: listing.id,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: expect.any(String),
      listingId: listing.id,
      addedAt: expect.any(String),
    });
  });

  it("treats duplicate adds as idempotent", async () => {
    const listing = await createWishlistListing();

    const first = await authedRequest(buyerToken, "POST", "/api/v1/customer/wishlist", {
      listingId: listing.id,
    });
    const second = await authedRequest(buyerToken, "POST", "/api/v1/customer/wishlist", {
      listingId: listing.id,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
    expect(second.json().listingId).toBe(listing.id);
  });

  it("removes a listing from the wishlist", async () => {
    const listing = await createWishlistListing();

    await authedRequest(buyerToken, "POST", "/api/v1/customer/wishlist", {
      listingId: listing.id,
    });

    const removeRes = await authedRequest(
      buyerToken,
      "DELETE",
      `/api/v1/customer/wishlist/${listing.id}`,
    );

    expect(removeRes.statusCode).toBe(204);

    const listRes = await authedRequest(buyerToken, "GET", "/api/v1/customer/wishlist");
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toEqual({ items: [], nextCursor: null });
  });

  it("returns 404 when removing a non-existent wishlist entry", async () => {
    const res = await authedRequest(
      buyerToken,
      "DELETE",
      "/api/v1/customer/wishlist/01JFAKE0000000000000000000",
    );

    expect(res.statusCode).toBe(404);
  });

  it("lists wishlisted items with cursor pagination", async () => {
    const first = await createWishlistListing({
      inventoryTitle: "First Inventory Title",
      listingTitle: "First Channel Title",
      priceCents: 4100,
    });
    await waitForDistinctCursorOrder();

    const second = await createWishlistListing({
      inventoryTitle: "Second Inventory Title",
      listingTitle: "Second Channel Title",
      priceCents: 4200,
    });
    await waitForDistinctCursorOrder();

    const third = await createWishlistListing({
      inventoryTitle: "Third Inventory Title",
      listingTitle: "Third Channel Title",
      priceCents: 4300,
    });

    await authedRequest(buyerToken, "POST", "/api/v1/customer/wishlist", { listingId: first.id });
    await waitForDistinctCursorOrder();
    await authedRequest(buyerToken, "POST", "/api/v1/customer/wishlist", { listingId: second.id });
    await waitForDistinctCursorOrder();
    await authedRequest(buyerToken, "POST", "/api/v1/customer/wishlist", { listingId: third.id });

    const pageOne = await authedRequest(
      buyerToken,
      "GET",
      "/api/v1/customer/wishlist?limit=2",
    );

    expect(pageOne.statusCode).toBe(200);
    expect(pageOne.json().items).toHaveLength(2);
    expect(pageOne.json().items[0]).toMatchObject({
      listingId: third.id,
      title: "Third Inventory Title",
      priceCents: 4300,
      sellerName: "Wishlist Seller",
      listingStatus: "active",
    });
    expect(pageOne.json().items[0].primaryImageUrl).toContain(`/items/${third.inventoryItemId}/primary.jpg`);
    expect(pageOne.json().nextCursor).toBeTruthy();

    const pageTwo = await authedRequest(
      buyerToken,
      "GET",
      `/api/v1/customer/wishlist?limit=2&cursor=${pageOne.json().nextCursor}`,
    );

    expect(pageTwo.statusCode).toBe(200);
    expect(pageTwo.json().items).toHaveLength(1);
    expect(pageTwo.json().items[0].listingId).toBe(first.id);
    expect(pageTwo.json().items[0].title).toBe("First Inventory Title");
    expect(pageTwo.json().nextCursor).toBeNull();
  });

  it("filters hidden and sold listings out of the wishlist response", async () => {
    const visible = await createWishlistListing({ inventoryTitle: "Visible Listing" });
    const hidden = await createWishlistListing({ inventoryTitle: "Hidden Listing" });
    const sold = await createWishlistListing({ inventoryTitle: "Sold Listing" });

    await authedRequest(buyerToken, "POST", "/api/v1/customer/wishlist", { listingId: visible.id });
    await authedRequest(buyerToken, "POST", "/api/v1/customer/wishlist", { listingId: hidden.id });
    await authedRequest(buyerToken, "POST", "/api/v1/customer/wishlist", { listingId: sold.id });

    await db
      .update(channelListings)
      .set({ hiddenAt: new Date() })
      .where(eq(channelListings.id, hidden.id));

    await db
      .update(channelListings)
      .set({ status: "sold" })
      .where(eq(channelListings.id, sold.id));

    const res = await authedRequest(buyerToken, "GET", "/api/v1/customer/wishlist");

    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0].listingId).toBe(visible.id);
    expect(res.json().items[0].title).toBe("Visible Listing");
  });

  it("requires the listing to be active when adding to the wishlist", async () => {
    const listing = await createWishlistListing({ status: "draft" });

    const res = await authedRequest(buyerToken, "POST", "/api/v1/customer/wishlist", {
      listingId: listing.id,
    });

    expect(res.statusCode).toBe(404);
  });
});
