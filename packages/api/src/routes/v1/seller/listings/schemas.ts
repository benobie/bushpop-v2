import { z } from "zod";
import { ulidSchema } from "@bushpop/types/common";

// ── Request schemas ──

export const createListingSchema = z.object({
  inventoryItemId: ulidSchema,
  channelId: ulidSchema,
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  priceCents: z.number().int().min(1),
  currency: z.string().length(3).default("AUD"),
  handle: z.string().max(100).optional(),
});

export const updateListingSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  priceCents: z.number().int().min(1).optional(),
  handle: z.string().max(100).optional(),
  version: z.number().int().min(1),
});

export const archiveListingSchema = z.object({
  version: z.number().int().min(1),
});

export const transitionListingStatusSchema = z.object({
  to: z.enum(["draft", "active", "paused", "sold", "archived"]),
  version: z.number().int().min(1),
});

export const listListingsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().length(26).optional(),
  channelId: z.string().length(26).optional(),
  status: z.enum(["draft", "active", "paused", "sold", "archived"]).optional(),
});

// ── Response schemas ──

export const channelListingResponseSchema = z.object({
  id: z.string(),
  inventoryItemId: z.string(),
  channelId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  priceCents: z.number(),
  currency: z.string(),
  handle: z.string(),
  status: z.string(),
  publishedAt: z.coerce.date().nullable(),
  primaryImageUrl: z.string().nullable().optional(),
  version: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const cursorListingResponseSchema = z.object({
  items: z.array(channelListingResponseSchema),
  nextCursor: z.string().nullable(),
});

export const listingScoreResponseSchema = z.object({
  score: z.number().int(),
  photoScore: z.number().int(),
  descriptionScore: z.number().int(),
  completenessScore: z.number().int(),
  categoryScore: z.number().int(),
  qualityTier: z.enum(["bronze", "silver", "gold"]),
  nudgeKey: z.string().nullable(),
  nudgeMessage: z.string().nullable(),
});
