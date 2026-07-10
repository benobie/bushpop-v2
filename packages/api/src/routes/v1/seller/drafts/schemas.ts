import { z } from "zod";
import {
  COLOURS,
  GENDERS,
  MEASUREMENT_KEYS,
  PARCEL_SIZES,
  SHIPPING_OPTIONS,
} from "@bushpop/config";
import { ulidSchema } from "@bushpop/types/common";
import {
  inventoryItemImageResponseSchema,
} from "../inventory/schemas.js";

/** Draft image = inventory image + derived thumb-320 variant URL. */
export const draftImageResponseSchema = inventoryItemImageResponseSchema.extend({
  thumbUrl: z.string(),
});

/**
 * Drafts façade schemas (Phase 1 task 4).
 *
 * PATCH semantics per field: `undefined` = leave untouched, `null` = clear.
 * Every mutation carries the optimistic `version`.
 */

const versionSchema = z.number().int().min(1);

// ── Step bodies ──

export const detailsStepSchema = z.object({
  version: versionSchema,
  title: z.string().max(255).nullable().optional(),
  brand: z.string().max(100).nullable().optional(),
  /** Must reference a LEAF category (no children) when set. */
  categoryId: ulidSchema.nullable().optional(),
  size: z.string().max(20).nullable().optional(),
  sizeScale: z.enum(["alpha", "au", "shoe"]).nullable().optional(),
  colour: z
    .string()
    .refine((c) => (COLOURS as readonly string[]).includes(c), {
      message: `Colour must be one of: ${COLOURS.join(", ")}`,
    })
    .nullable()
    .optional(),
  /** Optional (W3/BF-15) — not required for publish, no listing-strength weight. */
  gender: z
    .string()
    .refine((g) => (GENDERS as readonly string[]).includes(g), {
      message: `Gender must be one of: ${GENDERS.join(", ")}`,
    })
    .nullable()
    .optional(),
  description: z.string().max(5000).nullable().optional(),
});

const measurementValueSchema = z
  .number()
  .finite()
  .positive()
  .max(500, "Measurements are centimetres — 500cm is not a garment");

export const conditionStepSchema = z.object({
  version: versionSchema,
  condition: z
    .enum(["new_with_tags", "like_new", "good", "fair", "poor"])
    .nullable()
    .optional(),
  conditionNotes: z.string().max(500).nullable().optional(),
  /**
   * Replaces the whole measurements object (send the full set each time).
   * Keys are validated against the item's leaf-category template in the
   * service; this schema gates the vocabulary superset + value sanity.
   */
  measurements: z
    .record(
      z.enum(MEASUREMENT_KEYS as unknown as [string, ...string[]]),
      measurementValueSchema,
    )
    .nullable()
    .optional(),
});

export const priceStepSchema = z.object({
  version: versionSchema,
  askingPriceCents: z.number().int().positive().max(5_000_000).nullable().optional(),
  rrpCents: z.number().int().positive().max(10_000_000).nullable().optional(),
});

export const shippingStepSchema = z.object({
  version: versionSchema,
  shippingOption: z.enum(SHIPPING_OPTIONS).nullable().optional(),
  parcelSize: z.enum(PARCEL_SIZES).nullable().optional(),
});

export const listDraftsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// ── Responses ──

export const strengthResponseSchema = z.object({
  score: z.number(),
  band: z.string(),
  breakdown: z.record(z.string(), z.number()),
  missing: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      step: z.number(),
      points: z.number(),
    }),
  ),
  version: z.string(),
});

export const draftResponseSchema = z.object({
  id: z.string(),
  version: z.number(),
  lifecycleState: z.string(),
  title: z.string().nullable(),
  brand: z.string().nullable(),
  categoryId: z.string().nullable(),
  category: z
    .object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      parentId: z.string().nullable(),
      parentSlug: z.string().nullable(),
    })
    .nullable(),
  size: z.string().nullable(),
  sizeScale: z.string().nullable(),
  colour: z.string().nullable(),
  gender: z.string().nullable(),
  description: z.string().nullable(),
  condition: z.string().nullable(),
  conditionNotes: z.string().nullable(),
  measurements: z.record(z.string(), z.number()).nullable(),
  measurementTemplate: z.object({
    key: z.string(),
    keys: z.array(z.string()),
    sizeExempt: z.boolean(),
  }),
  askingPriceCents: z.number().nullable(),
  rrpCents: z.number().nullable(),
  shippingOption: z.string().nullable(),
  parcelSize: z.string().nullable(),
  shippingClass: z.string().nullable(),
  images: z.array(draftImageResponseSchema),
  strength: strengthResponseSchema,
  // AI suggestions (confirm-not-commit — never canonical)
  aiTitle: z.string().nullable(),
  aiDescription: z.string().nullable(),
  aiSuggestedBrand: z.string().nullable(),
  aiSuggestedCategory: z.string().nullable(),
  aiSuggestedColour: z.string().nullable(),
  aiSuggestedGender: z.string().nullable(),
  aiConfidence: z.number().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const draftSummaryResponseSchema = z.object({
  id: z.string(),
  version: z.number(),
  title: z.string().nullable(),
  updatedAt: z.coerce.date(),
  readyImageCount: z.number(),
  strengthScore: z.number(),
});
