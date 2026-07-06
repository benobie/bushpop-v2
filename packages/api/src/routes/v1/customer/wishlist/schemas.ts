import { z } from "zod";

export const addToWishlistBodySchema = z.object({
  listingId: z.string().length(26),
});

export const wishlistParamsSchema = z.object({
  listingId: z.string().length(26),
});

export const wishlistQuerySchema = z.object({
  cursor: z.string().length(26).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const wishlistMutationResponseSchema = z.object({
  id: z.string().length(26),
  listingId: z.string().length(26),
  addedAt: z.string(),
});

export const wishlistItemResponseSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  listingHandle: z.string(),
  title: z.string(),
  priceCents: z.number(),
  currency: z.string(),
  primaryImageUrl: z.string().nullable(),
  sellerName: z.string(),
  listingStatus: z.string(),
  addedAt: z.string(),
});

export const wishlistListResponseSchema = z.object({
  items: z.array(wishlistItemResponseSchema),
  nextCursor: z.string().nullable(),
});

export const wishlistStatusResponseSchema = z.object({
  favorited: z.boolean(),
});
