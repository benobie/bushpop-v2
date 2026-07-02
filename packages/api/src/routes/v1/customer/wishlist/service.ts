import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  channelListings,
  inventoryItemImages,
  inventoryItems,
  sellerProfiles,
  wishlists,
} from "@bushpop/db/schema";
import { NotFoundError } from "../../../../lib/errors.js";
import { getPublicImageUrl } from "../../../../lib/image-url.js";

type WishlistEntry = {
  id: string;
  channelListingId: string;
  createdAt: Date;
};

async function getWishlistEntry(
  userId: string,
  channelListingId: string,
): Promise<WishlistEntry | undefined> {
  const [entry] = await db
    .select({
      id: wishlists.id,
      channelListingId: wishlists.channelListingId,
      createdAt: wishlists.createdAt,
    })
    .from(wishlists)
    .where(
      and(
        eq(wishlists.userId, userId),
        eq(wishlists.channelListingId, channelListingId),
      ),
    )
    .limit(1);

  return entry;
}

export async function addToWishlist(userId: string, channelListingId: string, channelId: string) {
  const [listing] = await db
    .select({ id: channelListings.id })
    .from(channelListings)
    .where(
      and(
        eq(channelListings.id, channelListingId),
        eq(channelListings.channelId, channelId),
        eq(channelListings.status, "active"),
        isNull(channelListings.hiddenAt),
      ),
    )
    .limit(1);

  if (!listing) {
    throw new NotFoundError("Listing not found or not available");
  }

  const [inserted] = await db
    .insert(wishlists)
    .values({ userId, channelListingId })
    .onConflictDoNothing()
    .returning({
      id: wishlists.id,
      channelListingId: wishlists.channelListingId,
      createdAt: wishlists.createdAt,
    });

  if (inserted) {
    return inserted;
  }

  const existing = await getWishlistEntry(userId, channelListingId);
  if (!existing) {
    throw new NotFoundError("Wishlist entry not found");
  }

  return existing;
}

export async function removeFromWishlist(userId: string, channelListingId: string) {
  const deleted = await db
    .delete(wishlists)
    .where(
      and(
        eq(wishlists.userId, userId),
        eq(wishlists.channelListingId, channelListingId),
      ),
    )
    .returning({ id: wishlists.id });

  if (deleted.length === 0) {
    throw new NotFoundError("Listing not found in wishlist");
  }
}

export async function listWishlist(
  userId: string,
  channelId: string,
  cursor?: string,
  limit = 20,
) {
  const conditions = [
    eq(wishlists.userId, userId),
    eq(channelListings.channelId, channelId),
    eq(channelListings.status, "active"),
    isNull(channelListings.hiddenAt),
  ];

  if (cursor) {
    conditions.push(lt(wishlists.id, cursor));
  }

  const rows = await db
    .select({
      wishlistId: wishlists.id,
      wishlistCreatedAt: wishlists.createdAt,
      listingId: channelListings.id,
      listingTitle: channelListings.title,
      inventoryTitle: inventoryItems.title,
      priceCents: channelListings.priceCents,
      currency: channelListings.currency,
      listingStatus: channelListings.status,
      primaryImageStorageKey: inventoryItemImages.storageKey,
      sellerName: sellerProfiles.storeName,
    })
    .from(wishlists)
    .innerJoin(channelListings, eq(wishlists.channelListingId, channelListings.id))
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .leftJoin(
      inventoryItemImages,
      and(
        eq(inventoryItemImages.inventoryItemId, inventoryItems.id),
        eq(inventoryItemImages.isPrimary, true),
        eq(inventoryItemImages.status, "ready"),
      ),
    )
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, inventoryItems.ownerId))
    .where(and(...conditions))
    .orderBy(desc(wishlists.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: pageRows.map((row) => ({
      id: row.wishlistId,
      listingId: row.listingId,
      title: row.inventoryTitle ?? row.listingTitle,
      priceCents: row.priceCents,
      currency: row.currency,
      primaryImageUrl: row.primaryImageStorageKey
        ? getPublicImageUrl(row.primaryImageStorageKey)
        : null,
      sellerName: row.sellerName ?? "",
      listingStatus: row.listingStatus,
      addedAt: row.wishlistCreatedAt.toISOString(),
    })),
    nextCursor: hasMore ? pageRows[pageRows.length - 1]!.wishlistId : null,
  };
}
