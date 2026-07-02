import { eq, and, ne, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { inventoryItems, inventoryItemImages, channelListings } from "@bushpop/db/schema";
import {
  createPresignedPutUrl,
  headObject,
  deleteObject,
  isAllowedContentType,
  getExtensionForContentType,
  type AllowedContentType,
} from "../../../../lib/r2.js";
import { getPublicImageUrl } from "../../../../lib/image-url.js";
import { cascadeImageDeletionToListings } from "../../../../lib/inventory-invariants.js";
import { NotFoundError, ConflictError, ValidationError } from "../../../../lib/errors.js";
import { dispatchEvent } from "../../../../lib/events.js";
import { ulid } from "ulid";

// ── Helpers ──

async function findOwnedItem(itemId: string, ownerId: string) {
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, itemId));

  if (!item || item.ownerId !== ownerId) {
    throw new NotFoundError("Inventory item not found");
  }
  return item;
}

function serializeImage(img: typeof inventoryItemImages.$inferSelect) {
  return {
    id: img.id,
    url: img.status === "ready" ? getPublicImageUrl(img.storageKey) : "",
    contentType: img.contentType,
    sizeBytes: img.sizeBytes,
    status: img.status,
    position: img.position,
    isPrimary: img.isPrimary,
    confirmedAt: img.confirmedAt,
    createdAt: img.createdAt,
  };
}

// ── Helpers ──

/**
 * Dispatch content_changed for all non-archived channel listings of an item.
 * Fire-and-forget — errors are logged but not propagated.
 */
async function dispatchContentChangedForItem(itemId: string, actorId: string): Promise<void> {
  const listings = await db
    .update(channelListings)
    .set({
      version: sql`${channelListings.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(channelListings.inventoryItemId, itemId),
        ne(channelListings.status, "archived"),
      ),
    )
    .returning({ id: channelListings.id, channelId: channelListings.channelId });

  for (const listing of listings) {
    await dispatchEvent({
      eventName: "channel_listing.content_changed",
      category: "listings",
      actorId,
      entityType: "channel_listing",
      entityId: listing.id,
      channelId: listing.channelId,
    }).catch((err: unknown) => {
      console.error(`[images] Failed to dispatch content_changed for listing ${listing.id}:`, err);
    });
  }
}

// ── Upload URL ──

export async function requestUploadUrl(
  itemId: string,
  ownerId: string,
  contentType: string,
) {
  const item = await findOwnedItem(itemId, ownerId);

  if (item.lifecycleState === "archived") {
    throw new ConflictError("Cannot upload images to an archived item");
  }

  // Guard: max 10 non-failed images per item
  const MAX_IMAGES_PER_ITEM = 10;
  const [imageCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryItemImages)
    .where(
      and(
        eq(inventoryItemImages.inventoryItemId, itemId),
        ne(inventoryItemImages.status, "failed"),
      ),
    );

  if (imageCount && imageCount.count >= MAX_IMAGES_PER_ITEM) {
    throw new ConflictError(`Maximum of ${MAX_IMAGES_PER_ITEM} images per item`);
  }

  if (!isAllowedContentType(contentType)) {
    throw new ValidationError(`Content type '${contentType}' is not allowed`);
  }

  const imageId = ulid();
  const ext = getExtensionForContentType(contentType as AllowedContentType);
  const key = `items/${itemId}/${imageId}.${ext}`;

  // Create placeholder row
  await db.insert(inventoryItemImages).values({
    id: imageId,
    inventoryItemId: itemId,
    storageKey: key,
    status: "pending",
  });

  const uploadUrl = await createPresignedPutUrl({
    key,
    contentType: contentType as AllowedContentType,
  });

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  return { uploadUrl, imageId, expiresAt };
}

// ── Confirm Upload ──

export async function confirmUpload(
  itemId: string,
  imageId: string,
  ownerId: string,
  data: { position: number; isPrimary: boolean },
) {
  // Verify ownership
  await findOwnedItem(itemId, ownerId);

  const [image] = await db
    .select()
    .from(inventoryItemImages)
    .where(
      and(
        eq(inventoryItemImages.id, imageId),
        eq(inventoryItemImages.inventoryItemId, itemId),
      ),
    );

  if (!image) {
    throw new NotFoundError("Image not found");
  }

  if (image.status !== "pending") {
    throw new ConflictError("Image has already been confirmed");
  }

  // Verify the object exists in R2
  const head = await headObject(image.storageKey);
  if (!head) {
    // Mark as failed
    await db
      .update(inventoryItemImages)
      .set({ status: "failed" })
      .where(eq(inventoryItemImages.id, imageId));
    throw new ValidationError("Upload not found in storage. Please try uploading again.");
  }

  // Update the image row
  if (data.isPrimary) {
    // Clear other primaries first
    await db
      .update(inventoryItemImages)
      .set({ isPrimary: false })
      .where(
        and(
          eq(inventoryItemImages.inventoryItemId, itemId),
          eq(inventoryItemImages.isPrimary, true),
        ),
      );
  }

  const [updated] = await db
    .update(inventoryItemImages)
    .set({
      status: "ready",
      contentType: head.contentType ?? null,
      sizeBytes: head.contentLength ?? null,
      position: data.position,
      isPrimary: data.isPrimary,
      confirmedAt: new Date(),
    })
    .where(eq(inventoryItemImages.id, imageId))
    .returning();

  // Fire-and-forget enrichment — worker owns all status transitions.
  // Skip enqueue entirely if no API key — avoids dead queue backlog.
  if (process.env.ANTHROPIC_API_KEY) {
    const { enqueueEnrichment } = await import("../../../../lib/enrichment-queue.js");
    enqueueEnrichment(itemId, ownerId);
  }

  // Dispatch content_changed for all channel listings of this item
  await dispatchContentChangedForItem(itemId, ownerId);

  return serializeImage(updated!);
}

// ── Batch Reorder ──

export async function batchReorderImages(
  itemId: string,
  ownerId: string,
  order: Array<{ imageId: string; position: number; isPrimary?: boolean }>,
) {
  await findOwnedItem(itemId, ownerId);

  await db.transaction(async (tx) => {
    // Only one can be primary
    const primaryCount = order.filter((o) => o.isPrimary).length;
    if (primaryCount > 1) {
      throw new ValidationError("Only one image can be primary");
    }

    // If any image is marked primary, clear all primaries first
    if (primaryCount === 1) {
      await tx
        .update(inventoryItemImages)
        .set({ isPrimary: false })
        .where(eq(inventoryItemImages.inventoryItemId, itemId));
    }

    for (const entry of order) {
      await tx
        .update(inventoryItemImages)
        .set({
          position: entry.position,
          ...(entry.isPrimary !== undefined ? { isPrimary: entry.isPrimary } : {}),
        })
        .where(
          and(
            eq(inventoryItemImages.id, entry.imageId),
            eq(inventoryItemImages.inventoryItemId, itemId),
          ),
        );
    }
  });

  // Return updated images
  const images = await db
    .select()
    .from(inventoryItemImages)
    .where(eq(inventoryItemImages.inventoryItemId, itemId))
    .orderBy(inventoryItemImages.position);

  await dispatchContentChangedForItem(itemId, ownerId);

  return images.map(serializeImage);
}

// ── Delete Image ──

export async function deleteImage(
  itemId: string,
  imageId: string,
  ownerId: string,
) {
  await findOwnedItem(itemId, ownerId);

  const [image] = await db
    .select()
    .from(inventoryItemImages)
    .where(
      and(
        eq(inventoryItemImages.id, imageId),
        eq(inventoryItemImages.inventoryItemId, itemId),
      ),
    );

  if (!image) {
    throw new NotFoundError("Image not found");
  }

  await db.transaction(async (tx) => {
    // Delete from DB
    await tx
      .delete(inventoryItemImages)
      .where(eq(inventoryItemImages.id, imageId));

    // If this was a ready image, check if we need to pause listings
    if (image.status === "ready") {
      await cascadeImageDeletionToListings(itemId, tx);
    }
  });

  // Delete from R2 (best-effort — orphan cleanup catches failures)
  try {
    await deleteObject(image.storageKey);
  } catch {
    // Log but don't fail the request
  }

  // Dispatch content_changed for all channel listings of this item
  await dispatchContentChangedForItem(itemId, ownerId);
}
