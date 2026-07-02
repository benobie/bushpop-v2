import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "@bushpop/db/client";
import { channelListings, inventoryItems, inventoryItemImages, sellerProfiles } from "@bushpop/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { getPublicImageUrl } from "../../../lib/image-url.js";
import { NotFoundError } from "../../../lib/errors.js";

const listingResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  priceCents: z.number(),
  currency: z.string(),
  handle: z.string(),
  status: z.string(),
  publishedAt: z.coerce.date().nullable(),
  images: z.array(
    z.object({
      id: z.string(),
      url: z.string(),
      position: z.number(),
      isPrimary: z.boolean(),
      aspectRatio: z.number().nullable(),
    }),
  ),
  seller: z.object({
    id: z.string(),
    handle: z.string(),
    storeName: z.string(),
    avatarUrl: z.string().nullable(),
  }).nullable(),
});

/** Fetch an active listing by ULID id or handle, with images and seller. */
async function fetchActiveListing(idOrHandle: string, channelId: string) {
  const isUlid = idOrHandle.length === 26 && /^[0-9A-HJKMNP-TV-Za-z]{26}$/.test(idOrHandle);

  const [listing] = await db
    .select()
    .from(channelListings)
    .where(
      and(
        isUlid
          ? eq(channelListings.id, idOrHandle)
          : eq(channelListings.handle, idOrHandle),
        eq(channelListings.channelId, channelId),
        eq(channelListings.status, "active"),
        isNull(channelListings.hiddenAt),
      ),
    );

  if (!listing) {
    throw new NotFoundError("Listing not found");
  }

  // Get images via inventory item
  const images = await db
    .select()
    .from(inventoryItemImages)
    .where(
      and(
        eq(inventoryItemImages.inventoryItemId, listing.inventoryItemId),
        eq(inventoryItemImages.status, "ready"),
      ),
    )
    .orderBy(inventoryItemImages.position);

  // Get seller profile via inventory item owner
  const [inventoryItem] = await db
    .select({ ownerId: inventoryItems.ownerId })
    .from(inventoryItems)
    .where(eq(inventoryItems.id, listing.inventoryItemId));

  let seller = null;
  if (inventoryItem) {
    const [profile] = await db
      .select()
      .from(sellerProfiles)
      .where(eq(sellerProfiles.userId, inventoryItem.ownerId));

    if (profile) {
      seller = {
        id: profile.id,
        handle: profile.handle,
        storeName: profile.storeName,
        avatarUrl: profile.avatarUrl,
      };
    }
  }

  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    priceCents: listing.priceCents,
    currency: listing.currency,
    handle: listing.handle,
    status: listing.status,
    publishedAt: listing.publishedAt,
    images: images.map((img) => ({
      id: img.id,
      url: getPublicImageUrl(img.storageKey),
      position: img.position,
      isPrimary: img.isPrimary,
      aspectRatio: img.aspectRatio ? Number(img.aspectRatio) : null,
    })),
    seller,
  };
}

export async function storeListingRoutes(app: FastifyInstance) {
  // GET /api/v1/store/listings/:handle — lookup by handle or ULID id
  // Supports both: /store/listings/vintage-jacket-abc123 (handle) and /store/listings/01ABC... (ULID)
  app.get("/api/v1/store/listings/:handle", {
    schema: {
      tags: ["Store"],
      summary: "Get a public listing by handle or ID",
      params: z.object({ handle: z.string().min(1).max(100) }),
      response: {
        200: listingResponseSchema,
      },
    },
  }, async (request) => {
    const { handle } = request.params as { handle: string };
    const channelId = request.channel.id;
    return fetchActiveListing(handle, channelId);
  });
}
