/**
 * Derive public image URLs from storage keys.
 * Single source of truth — no URL column in DB.
 *
 * Storage key layout (Phase 1 task 3 — image-variants worker):
 *   items/{itemId}/{imageId}.{ext}              — original full-resolution
 *   items/{itemId}/thumb-320/{imageId}.webp     — wizard/browse thumbs
 *   items/{itemId}/card-800/{imageId}.webp      — shop cards + gallery
 *   items/{itemId}/pdp-1600/{imageId}.webp      — PDP hero / zoom
 */

export const IMAGE_VARIANT_NAMES = ["thumb-320", "card-800", "pdp-1600"] as const;
export type ImageVariantName = (typeof IMAGE_VARIANT_NAMES)[number];

function getPublicBase(): string {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) {
    throw new Error("R2_PUBLIC_URL environment variable is required");
  }
  return publicUrl;
}

export function getPublicImageUrl(storageKey: string): string {
  return `${getPublicBase()}/${storageKey}`;
}

/**
 * Derive a variant URL for an image.
 * Variants are stored at `items/{itemId}/{variant}/{imageId}.webp`.
 */
export function variantUrl(
  itemId: string,
  imageId: string,
  variant: ImageVariantName,
): string {
  return `${getPublicBase()}/items/${itemId}/${variant}/${imageId}.webp`;
}

export function thumbUrl(itemId: string, imageId: string): string {
  return variantUrl(itemId, imageId, "thumb-320");
}

export function cardUrl(itemId: string, imageId: string): string {
  return variantUrl(itemId, imageId, "card-800");
}

export function pdpUrl(itemId: string, imageId: string): string {
  return variantUrl(itemId, imageId, "pdp-1600");
}

/**
 * Card-variant URL for a stored image, falling back to the full-resolution
 * original if the storage key doesn't parse into itemId/imageId. Callers
 * gate on `inventoryItemImages.status = "ready"` before reaching here, so
 * the variant is expected to exist — the fallback is defensive only.
 */
export function cardOrOriginalUrl(storageKey: string): string {
  const itemId = extractItemId(storageKey);
  const imageId = extractImageId(storageKey);
  return itemId && imageId ? cardUrl(itemId, imageId) : getPublicImageUrl(storageKey);
}

/**
 * Extract the imageId from a storage key.
 * Storage key format: `items/{itemId}/{imageId}.{ext}`
 */
export function extractImageId(storageKey: string): string | null {
  const parts = storageKey.split("/");
  if (parts.length < 3) return null;
  const filename = parts[parts.length - 1]!;
  return filename.split(".")[0] ?? null;
}

/**
 * Extract the itemId from a storage key.
 * Storage key format: `items/{itemId}/{imageId}.{ext}`
 */
export function extractItemId(storageKey: string): string | null {
  const parts = storageKey.split("/");
  if (parts.length < 3) return null;
  return parts[1] ?? null;
}
