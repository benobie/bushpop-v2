import { GARMENT_TYPE_LABELS, type GarmentType } from "@bushpop/config";

/**
 * Buyer-facing category labels. Top-level garment types use the canonical
 * @bushpop/config labels; leaf slugs (e.g. "t-shirts") are title-cased —
 * mirrors packages/db/src/seeds/categories.ts `slugToName`, the single
 * place leaf display names are generated from slugs.
 */
export function categoryLabel(slug: string): string {
  const garmentLabel = GARMENT_TYPE_LABELS[slug as GarmentType];
  if (garmentLabel) return garmentLabel;
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
