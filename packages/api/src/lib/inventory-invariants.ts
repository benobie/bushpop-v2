import { eq, and, sql, inArray } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "@bushpop/db/client";
import { inventoryItems, inventoryItemImages } from "@bushpop/db/schema";
import { channelListings } from "@bushpop/db/schema";
import { LISTABLE_LIFECYCLE_STATES, type LifecycleState } from "./inventory-machines.js";
import { dispatchEvent } from "./events.js";
import { ConflictError, ValidationError } from "./errors.js";

/**
 * Ensure an inventory item's lifecycle allows listing activation.
 * Throws ValidationError if not in for_sale or offer_only.
 */
export async function ensureItemListable(itemId: string): Promise<void> {
  const [item] = await db
    .select({
      lifecycleState: inventoryItems.lifecycleState,
      availabilityStatus: inventoryItems.availabilityStatus,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.id, itemId));

  if (!item) {
    throw new ValidationError("Inventory item not found");
  }

  if (item.availabilityStatus === "reserved" || item.availabilityStatus === "sold") {
    throw new ValidationError(
      `Cannot activate listing: item is ${item.availabilityStatus}`,
    );
  }

  if (!LISTABLE_LIFECYCLE_STATES.includes(item.lifecycleState as LifecycleState)) {
    throw new ValidationError(
      `Item lifecycle must be for_sale or offer_only to activate a listing (currently: ${item.lifecycleState})`,
    );
  }
}

/**
 * Ensure an inventory item has at least one confirmed (ready) image.
 * Throws ValidationError if no ready images exist.
 */
export async function ensureItemHasReadyImage(itemId: string): Promise<void> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryItemImages)
    .where(
      and(
        eq(inventoryItemImages.inventoryItemId, itemId),
        eq(inventoryItemImages.status, "ready"),
      ),
    );

  if (!result || result.count === 0) {
    throw new ValidationError("Item must have at least one confirmed image to activate a listing");
  }
}

/**
 * Cascade lifecycle transitions to channel listings.
 * Must be called within the same transaction as the lifecycle update.
 *
 * Rules:
 * - → owned / inventory_only: pause all active listings
 * - → archived: archive all listings
 * - → sold: mark all listings sold
 */
export async function cascadeLifecycleToListings(
  itemId: string,
  newState: LifecycleState,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<void> {
  let affectedListings: Array<{ id: string; channelId: string; status: string }> = [];
  let toStatus: string | null = null;

  if (newState === "owned" || newState === "inventory_only") {
    // Find active listings before updating
    affectedListings = await tx
      .select({ id: channelListings.id, channelId: channelListings.channelId, status: channelListings.status })
      .from(channelListings)
      .where(
        and(
          eq(channelListings.inventoryItemId, itemId),
          eq(channelListings.status, "active"),
        ),
      );
    toStatus = "paused";

    if (affectedListings.length > 0) {
      await tx
        .update(channelListings)
        .set({ status: "paused", updatedAt: new Date() })
        .where(
          inArray(channelListings.id, affectedListings.map((l) => l.id)),
        );
    }
  } else if (newState === "archived") {
    // Find non-archived listings before updating
    affectedListings = await tx
      .select({ id: channelListings.id, channelId: channelListings.channelId, status: channelListings.status })
      .from(channelListings)
      .where(
        and(
          eq(channelListings.inventoryItemId, itemId),
          sql`${channelListings.status} != 'archived'`,
        ),
      );
    toStatus = "archived";

    if (affectedListings.length > 0) {
      await tx
        .update(channelListings)
        .set({ status: "archived", updatedAt: new Date() })
        .where(
          inArray(channelListings.id, affectedListings.map((l) => l.id)),
        );
    }
  } else if (newState === "sold") {
    // Find draft/active/paused listings before updating
    affectedListings = await tx
      .select({ id: channelListings.id, channelId: channelListings.channelId, status: channelListings.status })
      .from(channelListings)
      .where(
        and(
          eq(channelListings.inventoryItemId, itemId),
          sql`${channelListings.status} IN ('draft', 'active', 'paused')`,
        ),
      );
    toStatus = "sold";

    if (affectedListings.length > 0) {
      await tx
        .update(channelListings)
        .set({ status: "sold", updatedAt: new Date() })
        .where(
          inArray(channelListings.id, affectedListings.map((l) => l.id)),
        );
    }
  }

  // Emit events for each affected listing
  for (const listing of affectedListings) {
    await dispatchEvent({
      eventName: "channel_listing.status_changed",
      category: "listing",
      entityType: "channel_listing",
      entityId: listing.id,
      channelId: listing.channelId,
      metadata: { from: listing.status, to: toStatus, trigger: "lifecycle_cascade" },
    });
  }
}

/**
 * After deleting an image, check if the item still has ready images.
 * If not, auto-pause any active listings.
 */
export async function cascadeImageDeletionToListings(
  itemId: string,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<void> {
  const [result] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryItemImages)
    .where(
      and(
        eq(inventoryItemImages.inventoryItemId, itemId),
        eq(inventoryItemImages.status, "ready"),
      ),
    );

  if (!result || result.count === 0) {
    // Find active listings before pausing
    const activeListings = await tx
      .select({ id: channelListings.id, channelId: channelListings.channelId })
      .from(channelListings)
      .where(
        and(
          eq(channelListings.inventoryItemId, itemId),
          eq(channelListings.status, "active"),
        ),
      );

    if (activeListings.length > 0) {
      await tx
        .update(channelListings)
        .set({ status: "paused", updatedAt: new Date() })
        .where(
          inArray(channelListings.id, activeListings.map((l) => l.id)),
        );

      for (const listing of activeListings) {
        await dispatchEvent({
          eventName: "channel_listing.status_changed",
          category: "listing",
          entityType: "channel_listing",
          entityId: listing.id,
          channelId: listing.channelId,
          metadata: { from: "active", to: "paused", trigger: "image_deletion_cascade" },
        });
      }
    }
  }
}
