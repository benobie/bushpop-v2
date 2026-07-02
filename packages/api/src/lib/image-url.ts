/**
 * Derive public image URLs from storage keys.
 * Single source of truth — no URL column in DB.
 *
 * Storage key layout (Sprint 1a — C4-RETROFIT FM-R2-4 + FM-R3-2):
 *   items/{itemId}/{imageId}.{ext}              — original full-resolution
 *   items/{itemId}/thumb-800/{imageId}.webp     — 800px longest-edge WebP (browse cards + gallery thumbs)
 *   items/{itemId}/hero-1200/{imageId}.webp     — 1200px longest-edge WebP (PDP hero)
 */

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
 * Derive the thumb-800 variant URL for an image.
 * Assumes the original storageKey is `items/{itemId}/{imageId}.{ext}`.
 * The thumbnail is stored at `items/{itemId}/thumb-800/{imageId}.webp`.
 */
export function thumbUrl(itemId: string, imageId: string): string {
  return `${getPublicBase()}/items/${itemId}/thumb-800/${imageId}.webp`;
}

/**
 * Derive the hero-1200 variant URL for an image.
 * Assumes the original storageKey is `items/{itemId}/{imageId}.{ext}`.
 * The hero is stored at `items/{itemId}/hero-1200/{imageId}.webp`.
 */
export function heroUrl(itemId: string, imageId: string): string {
  return `${getPublicBase()}/items/${itemId}/hero-1200/${imageId}.webp`;
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
