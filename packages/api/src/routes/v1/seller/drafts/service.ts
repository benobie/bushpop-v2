import { and, count, desc, eq, notExists, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  categories,
  channelListings,
  inventoryItems,
  inventoryItemImages,
} from "@bushpop/db/schema";
import {
  computeListingStrength,
  isSizeExempt,
  MEASUREMENT_TEMPLATES,
  parcelToShippingClass,
  strengthBand,
  LISTING_STRENGTH_VERSION,
  type ParcelSize,
} from "@bushpop/config";
import { ConflictError, NotFoundError, ValidationError } from "../../../../lib/errors.js";
import { dispatchEvent } from "../../../../lib/events.js";
import { getPublicImageUrl, thumbUrl, extractImageId } from "../../../../lib/image-url.js";
import {
  buildStrengthInput,
  measurementTemplateFor,
  resolveCategoryInfo,
  type CategoryInfo,
} from "../../../../lib/strength-input.js";
import type { z } from "zod";
import type {
  conditionStepSchema,
  detailsStepSchema,
  priceStepSchema,
  shippingStepSchema,
} from "./schemas.js";

/**
 * Drafts façade (Phase 1 task 4, D7).
 *
 * A draft IS an inventory_items row (`draftId := itemId`) in lifecycle
 * `owned` with no channel listing. The façade owns the wizard's step-shaped
 * PATCH surface + validation; publish (task 8) graduates the row into a
 * channel listing via the existing createListing()/transition machinery.
 */

type DetailsInput = z.infer<typeof detailsStepSchema>;
type ConditionInput = z.infer<typeof conditionStepSchema>;
type PriceInput = z.infer<typeof priceStepSchema>;
type ShippingInput = z.infer<typeof shippingStepSchema>;

type InventoryItemRow = typeof inventoryItems.$inferSelect;

// ── Internals ──

async function findOwnedDraft(id: string, ownerId: string): Promise<InventoryItemRow> {
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id));

  if (!item || item.ownerId !== ownerId) {
    throw new NotFoundError("Draft not found");
  }
  if (item.lifecycleState === "archived") {
    throw new NotFoundError("Draft not found");
  }
  return item;
}

/** Drafts are pre-publish only — after publish the item leaves `owned`. */
function assertDraftMutable(item: InventoryItemRow): void {
  if (item.lifecycleState !== "owned") {
    throw new ConflictError(
      "This item has been published — edit it through your listings, not the draft flow",
    );
  }
}

async function applyOptimisticUpdate(
  id: string,
  version: number,
  updates: Record<string, unknown>,
): Promise<void> {
  const result = await db
    .update(inventoryItems)
    .set({ ...updates, version: version + 1, updatedAt: new Date() })
    .where(and(eq(inventoryItems.id, id), eq(inventoryItems.version, version)))
    .returning({ id: inventoryItems.id });

  if (result.length === 0) {
    throw new ConflictError(
      "Draft was modified by another request. Please retry with the latest version.",
    );
  }
}

/** Strip `version` and drop undefined keys (undefined = leave untouched). */
function collectUpdates(input: Record<string, unknown>): Record<string, unknown> {
  const { version: _version, ...fields } = input;
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) updates[key] = value;
  }
  return updates;
}

function serializeImage(img: typeof inventoryItemImages.$inferSelect) {
  const imageId = extractImageId(img.storageKey);
  const itemId = img.inventoryItemId;
  return {
    id: img.id,
    url: img.status === "ready" ? getPublicImageUrl(img.storageKey) : "",
    thumbUrl: img.status === "ready" && imageId ? thumbUrl(itemId, imageId) : "",
    contentType: img.contentType,
    sizeBytes: img.sizeBytes,
    status: img.status,
    position: img.position,
    isPrimary: img.isPrimary,
    confirmedAt: img.confirmedAt,
    createdAt: img.createdAt,
  };
}

async function serializeDraft(item: InventoryItemRow) {
  const images = await db
    .select()
    .from(inventoryItemImages)
    .where(eq(inventoryItemImages.inventoryItemId, item.id))
    .orderBy(inventoryItemImages.position);

  const readyImageCount = images.filter((img) => img.status === "ready").length;
  const category = await resolveCategoryInfo(item.categoryId);
  const strength = computeListingStrength(buildStrengthInput(item, readyImageCount, category));
  const templateKey = measurementTemplateFor(category);
  const template = MEASUREMENT_TEMPLATES[templateKey];

  return {
    id: item.id,
    version: item.version,
    lifecycleState: item.lifecycleState,
    title: item.title,
    brand: item.brand,
    categoryId: item.categoryId,
    category: category
      ? {
          id: category.id,
          slug: category.slug,
          name: category.name,
          parentId: category.parentId,
          parentSlug: category.parentSlug,
        }
      : null,
    size: item.size,
    sizeScale: item.sizeScale,
    colour: item.colour,
    description: item.description,
    condition: item.condition,
    conditionNotes: item.conditionNotes,
    measurements: item.measurements,
    measurementTemplate: {
      key: templateKey,
      keys: [...template.keys],
      sizeExempt: category ? isSizeExempt(category.garmentSlug) : false,
    },
    askingPriceCents: item.askingPriceCents,
    rrpCents: item.rrpCents,
    shippingOption: item.shippingOption,
    parcelSize: item.parcelSize,
    shippingClass: item.shippingClass,
    images: images.map(serializeImage),
    strength: {
      score: strength.score,
      band: strengthBand(strength.score),
      breakdown: strength.breakdown,
      missing: strength.missing,
      version: LISTING_STRENGTH_VERSION,
    },
    aiTitle: item.aiTitle,
    aiDescription: item.aiDescription,
    aiSuggestedBrand: item.aiSuggestedBrand,
    aiSuggestedCategory: item.aiSuggestedCategory,
    aiSuggestedColour: item.aiSuggestedColour,
    aiConfidence: item.aiConfidence,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

// ── Create / read ──

export async function createDraft(ownerId: string, batchId?: string) {
  const [item] = await db
    .insert(inventoryItems)
    .values(batchId ? { ownerId, batchId } : { ownerId })
    .returning();

  await dispatchEvent({
    eventName: "inventory_item.created",
    category: "inventory",
    actorId: ownerId,
    entityType: "inventory_item",
    entityId: item!.id,
    metadata: { source: batchId ? "bulk_tool" : "sell_flow_draft" },
  });

  return serializeDraft(item!);
}

export async function getDraft(id: string, ownerId: string) {
  const item = await findOwnedDraft(id, ownerId);
  return serializeDraft(item);
}

export async function listDrafts(ownerId: string, limit: number) {
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.ownerId, ownerId),
        eq(inventoryItems.lifecycleState, "owned"),
        notExists(
          db
            .select({ one: sql`1` })
            .from(channelListings)
            .where(eq(channelListings.inventoryItemId, inventoryItems.id)),
        ),
      ),
    )
    .orderBy(desc(inventoryItems.updatedAt))
    .limit(limit);

  const summaries = [];
  for (const item of rows) {
    const [imageCountRow] = await db
      .select({ count: count() })
      .from(inventoryItemImages)
      .where(
        and(
          eq(inventoryItemImages.inventoryItemId, item.id),
          eq(inventoryItemImages.status, "ready"),
        ),
      );
    const readyImageCount = imageCountRow?.count ?? 0;
    const category = await resolveCategoryInfo(item.categoryId);
    const strength = computeListingStrength(
      buildStrengthInput(item, readyImageCount, category),
    );
    summaries.push({
      id: item.id,
      version: item.version,
      title: item.title,
      updatedAt: item.updatedAt,
      readyImageCount,
      strengthScore: strength.score,
    });
  }
  return { drafts: summaries };
}

// ── Step PATCHes ──

export async function patchDetails(id: string, ownerId: string, input: DetailsInput) {
  const item = await findOwnedDraft(id, ownerId);
  assertDraftMutable(item);

  const updates = collectUpdates(input);

  if (typeof updates.categoryId === "string") {
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, updates.categoryId));
    if (!category) {
      throw new ValidationError("Category not found");
    }
    // Must be a leaf: no child categories. Parents without children
    // (swimwear, activewear, other) count as leaves.
    const [child] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, category.id))
      .limit(1);
    if (child) {
      throw new ValidationError("Pick a leaf category, not a parent group");
    }
  }

  // Normalise empty strings to null (clears)
  for (const key of ["title", "brand", "size", "colour", "description"]) {
    if (updates[key] === "") updates[key] = null;
  }

  await applyOptimisticUpdate(id, input.version, updates);
  return getDraft(id, ownerId);
}

export async function patchCondition(id: string, ownerId: string, input: ConditionInput) {
  const item = await findOwnedDraft(id, ownerId);
  assertDraftMutable(item);

  const updates = collectUpdates(input);
  if (updates.conditionNotes === "") updates.conditionNotes = null; // "" clears, like details-step strings

  if (updates.measurements && typeof updates.measurements === "object") {
    const category = await resolveCategoryInfo(item.categoryId);
    const templateKey = measurementTemplateFor(category);
    const allowedKeys = new Set<string>(MEASUREMENT_TEMPLATES[templateKey].keys);
    const badKeys = Object.keys(updates.measurements).filter((key) => !allowedKeys.has(key));
    if (badKeys.length > 0) {
      throw new ValidationError(
        `Measurement keys not in the '${templateKey}' template: ${badKeys.join(", ")}. Allowed: ${[...allowedKeys].join(", ")}`,
      );
    }
  }

  await applyOptimisticUpdate(id, input.version, updates);
  return getDraft(id, ownerId);
}

export async function patchPrice(id: string, ownerId: string, input: PriceInput) {
  const item = await findOwnedDraft(id, ownerId);
  assertDraftMutable(item);

  await applyOptimisticUpdate(id, input.version, collectUpdates(input));
  return getDraft(id, ownerId);
}

export async function patchShipping(id: string, ownerId: string, input: ShippingInput) {
  const item = await findOwnedDraft(id, ownerId);
  assertDraftMutable(item);

  const updates = collectUpdates(input);

  // Derive the engine shipping class from the parcel choice so buyer-side
  // flat-rate shipping always agrees with the seller's parcel (task 1).
  if (typeof updates.parcelSize === "string") {
    updates.shippingClass = parcelToShippingClass(updates.parcelSize as ParcelSize);
  } else if (updates.parcelSize === null) {
    updates.shippingClass = null;
  }

  await applyOptimisticUpdate(id, input.version, updates);
  return getDraft(id, ownerId);
}
