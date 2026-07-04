import { z } from "zod";
import { draftResponseSchema } from "../drafts/schemas.js";

export const createBatchSchema = z.object({
  label: z.string().trim().max(255).optional(),
});

export const batchSummarySchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  itemCount: z.number().int(),
  publishedCount: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const listBatchesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createBatchDraftsSchema = z.object({
  // Internal ops tool — hard cap keeps a single request bounded and mirrors
  // the day-1 launch scope (150-250 items/day, not thousands in one call).
  count: z.number().int().min(1).max(50),
});

export const batchItemsResponseSchema = z.object({
  batch: batchSummarySchema,
  items: z.array(draftResponseSchema),
});

export const bulkPublishRequestSchema = z.object({
  legalAgree: z.boolean(),
});

export const bulkPublishResultSchema = z.object({
  published: z.array(
    z.object({
      itemId: z.string(),
      listingId: z.string(),
      handle: z.string(),
      strengthScore: z.number(),
    }),
  ),
  failed: z.array(
    z.object({
      itemId: z.string(),
      reason: z.string(),
      missing: z.array(z.string()).optional(),
    }),
  ),
});
