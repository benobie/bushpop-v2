import { z } from "zod";
import { ulidSchema } from "@bushpop/types/common";

// ── Request schemas ──

export const createInventoryItemSchema = z.object({
  title: z.string().max(255).optional(),
  description: z.string().max(5000).optional(),
  brand: z.string().max(100).optional(),
  categoryId: ulidSchema.optional(),
  size: z.string().max(20).optional(),
  colour: z.string().max(30).optional(),
  material: z.string().max(50).optional(),
  era: z.string().max(50).optional(),
  fit: z.string().max(50).optional(),
  condition: z.enum(["new_with_tags", "like_new", "good", "fair", "poor"]).optional(),
  conditionNotes: z.string().max(500).optional(),
  shippingClass: z.enum(["xs", "s", "m", "l", "xl"]).optional(),
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial().extend({
  version: z.number().int().min(1),
});

export const archiveInventoryItemSchema = z.object({
  version: z.number().int().min(1),
});

export const transitionLifecycleSchema = z.object({
  to: z.enum(["owned", "for_sale", "offer_only", "inventory_only", "sold", "archived"]),
  version: z.number().int().min(1),
});

export const listInventoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().length(26).optional(),
  lifecycleState: z.enum(["owned", "for_sale", "offer_only", "inventory_only", "sold", "archived"]).optional(),
});

// ── Response schemas ──

export const inventoryItemImageResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  status: z.string(),
  position: z.number(),
  isPrimary: z.boolean(),
  confirmedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});

export const inventoryItemResponseSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  availabilityStatus: z.string(),
  lifecycleState: z.string(),
  version: z.number(),
  brand: z.string().nullable(),
  categoryId: z.string().nullable(),
  size: z.string().nullable(),
  colour: z.string().nullable(),
  material: z.string().nullable(),
  era: z.string().nullable(),
  fit: z.string().nullable(),
  condition: z.string().nullable(),
  conditionNotes: z.string().nullable(),
  shippingClass: z.string().nullable(),
  images: z.array(inventoryItemImageResponseSchema).optional(),
  // AI enrichment fields
  aiTitle: z.string().nullable().optional(),
  aiDescription: z.string().nullable().optional(),
  aiTags: z.array(z.string()).nullable().optional(),
  aiSuggestedCategory: z.string().nullable().optional(),
  aiSuggestedColour: z.string().nullable().optional(),
  aiSuggestedMaterial: z.string().nullable().optional(),
  aiConfidence: z.number().nullable().optional(),
  aiPromptVersion: z.string().nullable().optional(),
  aiStatus: z.enum(["none", "processing", "completed", "failed"]).optional(),
  aiEnrichedAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const cursorResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });
