import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { categories, inventoryItems } from "@bushpop/db/schema";
import {
  isSizeExempt,
  templateKeyForCategory,
  type ListingStrengthInput,
  type MeasurementTemplateKey,
} from "@bushpop/config";

/**
 * Assemble a `ListingStrengthInput` from an inventory item row — the single
 * place that maps engine rows onto the shared strength-v3 rubric so the
 * drafts API, publish gate and listing-score worker all score identically.
 */

export interface CategoryInfo {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  /** Parent garment-type slug; the category's own slug when it IS a parent. */
  garmentSlug: string;
  parentSlug: string | null;
}

export async function resolveCategoryInfo(
  categoryId: string | null | undefined,
): Promise<CategoryInfo | null> {
  if (!categoryId) return null;

  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, categoryId));
  if (!category) return null;

  let parentSlug: string | null = null;
  if (category.parentId) {
    const [parent] = await db
      .select({ slug: categories.slug })
      .from(categories)
      .where(eq(categories.id, category.parentId));
    parentSlug = parent?.slug ?? null;
  }

  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    parentId: category.parentId,
    garmentSlug: parentSlug ?? category.slug,
    parentSlug,
  };
}

export function measurementTemplateFor(
  category: CategoryInfo | null,
): MeasurementTemplateKey {
  return templateKeyForCategory(category?.slug ?? null, category?.parentSlug ?? null);
}

export function hasMeasurementValues(
  measurements: Record<string, number> | null | undefined,
): boolean {
  if (!measurements) return false;
  return Object.values(measurements).some(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
}

type InventoryItemRow = typeof inventoryItems.$inferSelect;

export function buildStrengthInput(
  item: InventoryItemRow,
  readyImageCount: number,
  category: CategoryInfo | null,
): ListingStrengthInput {
  return {
    photoCount: readyImageCount,
    title: item.title,
    brand: item.brand,
    categoryLeaf: category?.slug ?? null,
    size: item.size,
    sizeExempt: category ? isSizeExempt(category.garmentSlug) : false,
    colour: item.colour,
    description: item.description,
    condition: item.condition,
    hasMeasurements: hasMeasurementValues(item.measurements),
    priceCents: item.askingPriceCents,
    rrpCents: item.rrpCents,
    // D19: offers excluded day 1 — the +2 weight stays in the module.
    offersEnabled: false,
  };
}
