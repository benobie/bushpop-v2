import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared query params
// ---------------------------------------------------------------------------

export const SORT_OPTIONS = ["newest", "price_asc", "price_desc"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const browseQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  categorySlug: z.string().optional(),
  size: z.string().optional(),
  colour: z.string().optional(),
  brand: z.string().optional(),
  condition: z.string().optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(SORT_OPTIONS).default("newest"),
});

export type BrowseQuery = z.infer<typeof browseQuerySchema>;

export const searchQuerySchema = browseQuerySchema.extend({
  q: z.string().min(1).max(200),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

export const storeListingCardSellerSchema = z.object({
  id: z.string(),
  handle: z.string(),
  storeName: z.string(),
  avatarUrl: z.string().nullable(),
});

export const storeListingCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  handle: z.string(),
  priceCents: z.number(),
  currency: z.string(),
  publishedAt: z.number().nullable(), // Unix timestamp ms
  primaryImageUrl: z.string().nullable(),
  brand: z.string().nullable(),
  size: z.string().nullable(),
  colour: z.string().nullable(),
  condition: z.string().nullable(),
  categorySlug: z.string().nullable(),
  seller: storeListingCardSellerSchema,
});

export type StoreListingCard = z.infer<typeof storeListingCardSchema>;

export const listingPageResponseSchema = z.object({
  items: z.array(storeListingCardSchema),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
});

export type ListingPageResponse = z.infer<typeof listingPageResponseSchema>;
