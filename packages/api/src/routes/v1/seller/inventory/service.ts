import { eq, and, lt, desc, sql, ne } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { inventoryItems, inventoryItemImages, channelListings } from "@bushpop/db/schema";
import { transition } from "../../../../lib/state-machine.js";
import { LIFECYCLE_MACHINE, type LifecycleState } from "../../../../lib/inventory-machines.js";
import { cascadeLifecycleToListings } from "../../../../lib/inventory-invariants.js";
import { NotFoundError, ConflictError } from "../../../../lib/errors.js";
import { dispatchEvent } from "../../../../lib/events.js";
import { getPublicImageUrl } from "../../../../lib/image-url.js";
import type { z } from "zod";
import type {
  createInventoryItemSchema,
  updateInventoryItemSchema,
} from "./schemas.js";

type CreateInput = z.infer<typeof createInventoryItemSchema>;
type UpdateInput = z.infer<typeof updateInventoryItemSchema>;

// ── Helpers ──

async function findOwnedItem(id: string, ownerId: string) {
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id));

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
      console.error(`[inventory] Failed to dispatch content_changed for listing ${listing.id}:`, err);
    });
  }
}

// ── CRUD ──

export async function createInventoryItem(ownerId: string, data: CreateInput) {
  const [item] = await db
    .insert(inventoryItems)
    .values({
      ownerId,
      ...data,
    })
    .returning();

  await dispatchEvent({
    eventName: "inventory_item.created",
    category: "inventory",
    actorId: ownerId,
    entityType: "inventory_item",
    entityId: item!.id,
  });

  return item!;
}

export async function listInventoryItems(
  ownerId: string,
  params: { limit: number; cursor?: string; lifecycleState?: string },
) {
  const conditions = [eq(inventoryItems.ownerId, ownerId)];

  if (params.cursor) {
    conditions.push(lt(inventoryItems.id, params.cursor));
  }
  if (params.lifecycleState) {
    conditions.push(eq(inventoryItems.lifecycleState, params.lifecycleState));
  }

  // Fetch one extra to detect if there's a next page
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(and(...conditions))
    .orderBy(desc(inventoryItems.id))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const items = hasMore ? rows.slice(0, params.limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.id : null;

  return { items, nextCursor };
}

export async function getInventoryItem(id: string, ownerId: string) {
  const item = await findOwnedItem(id, ownerId);

  const images = await db
    .select()
    .from(inventoryItemImages)
    .where(eq(inventoryItemImages.inventoryItemId, id))
    .orderBy(inventoryItemImages.position);

  return {
    ...item,
    images: images.map(serializeImage),
  };
}

export async function updateInventoryItem(
  id: string,
  ownerId: string,
  data: UpdateInput,
) {
  const { version, ...updates } = data;

  const item = await findOwnedItem(id, ownerId);

  if (item.lifecycleState === "archived") {
    throw new ConflictError("Cannot update an archived item");
  }

  const newVersion = version + 1;
  const result = await db
    .update(inventoryItems)
    .set({ ...updates, version: newVersion, updatedAt: new Date() })
    .where(
      and(
        eq(inventoryItems.id, id),
        eq(inventoryItems.version, version),
        // Ownership is already proven by findOwnedItem() above. Repeating the
        // predicate here keeps the guarantee in the query rather than in a
        // caller's memory.
        eq(inventoryItems.ownerId, ownerId),
      ),
    )
    .returning();

  if (result.length === 0) {
    throw new ConflictError(
      "Resource was modified by another request. Please retry with the latest version.",
    );
  }

  const scoreRelevantFields = [
    "description",
    "categoryId",
    "size",
    "condition",
    "conditionNotes",
  ] as const;
  const hasScoreRelevantChange = scoreRelevantFields.some((field) => field in updates);
  if (hasScoreRelevantChange) {
    await dispatchContentChangedForItem(id, ownerId);
  }

  return result[0]!;
}

// ── Lifecycle transitions ──

export async function transitionLifecycle(
  id: string,
  ownerId: string,
  to: LifecycleState,
  version: number,
) {
  const item = await findOwnedItem(id, ownerId);
  const from = item.lifecycleState as LifecycleState;

  // Validate state transition
  transition(LIFECYCLE_MACHINE, "inventory item", from, to);

  // Execute in transaction with row locks for cross-table cascade
  const result = await db.transaction(async (tx) => {
    // Lock and update the item
    const newVersion = version + 1;
    const [updated] = await tx
      .update(inventoryItems)
      .set({ lifecycleState: to, version: newVersion, updatedAt: new Date() })
      .where(
        and(
          eq(inventoryItems.id, id),
          eq(inventoryItems.version, version),
        ),
      )
      .returning();

    if (!updated) {
      throw new ConflictError(
        "Resource was modified by another request. Please retry with the latest version.",
      );
    }

    // Cascade to listings
    await cascadeLifecycleToListings(id, to, tx);

    return updated;
  });

  await dispatchEvent({
    eventName: "inventory_item.lifecycle_changed",
    category: "inventory",
    actorId: ownerId,
    entityType: "inventory_item",
    entityId: id,
    metadata: { from, to },
  });

  return {
    id: result.id,
    lifecycleState: result.lifecycleState,
    version: result.version,
  };
}

export async function archiveInventoryItem(id: string, ownerId: string, version: number) {
  const item = await findOwnedItem(id, ownerId);

  if (item.availabilityStatus === "reserved") {
    throw new ConflictError("Cannot archive a reserved item");
  }

  if (item.lifecycleState === "archived") {
    return; // Already archived — idempotent
  }

  const from = item.lifecycleState as LifecycleState;
  transition(LIFECYCLE_MACHINE, "inventory item", from, "archived");

  await db.transaction(async (tx) => {
    const result = await tx
      .update(inventoryItems)
      .set({
        lifecycleState: "archived",
        version: sql`${inventoryItems.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventoryItems.id, id),
          eq(inventoryItems.version, version),
        ),
      )
      .returning({ id: inventoryItems.id });

    if (result.length === 0) {
      throw new ConflictError("Resource was modified by another request. Please retry with the latest version.");
    }

    await cascadeLifecycleToListings(id, "archived", tx);
  });

  await dispatchEvent({
    eventName: "inventory_item.archived",
    category: "inventory",
    actorId: ownerId,
    entityType: "inventory_item",
    entityId: id,
  });
}
