import { eq, and, lt, desc, sql, asc } from "drizzle-orm";
import { SCORE_NUDGE_MESSAGES, scoreToQualityTier } from "@bushpop/config";
import { db } from "@bushpop/db/client";
import { channelListings, inventoryItems, inventoryItemImages, listingScores } from "@bushpop/db/schema";
import { getPublicImageUrl } from "../../../../lib/image-url.js";
import { transition } from "../../../../lib/state-machine.js";
import { LISTING_STATUS_MACHINE, type ListingStatus } from "../../../../lib/inventory-machines.js";
import { ensureItemListable, ensureItemHasReadyImage } from "../../../../lib/inventory-invariants.js";
import { assertListingActivationReady } from "../../../../lib/seller-readiness.js";
import { NotFoundError, ConflictError, ForbiddenError } from "../../../../lib/errors.js";
import { dispatchEvent } from "../../../../lib/events.js";
import { ulid } from "ulid";
import type { z } from "zod";
import type { createListingSchema, updateListingSchema } from "./schemas.js";

type CreateInput = z.infer<typeof createListingSchema>;
type UpdateInput = z.infer<typeof updateListingSchema>;

// ── Helpers ──

function generateHandle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const suffix = ulid().slice(-6).toLowerCase();
  return `${base}-${suffix}`;
}

async function findListingWithOwner(id: string) {
  const [listing] = await db
    .select({
      listing: channelListings,
      ownerId: inventoryItems.ownerId,
    })
    .from(channelListings)
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .where(eq(channelListings.id, id));

  if (!listing) {
    throw new NotFoundError("Listing not found");
  }

  return listing;
}

async function findOwnedListing(
  id: string,
  ownerId: string,
  ownershipFailure: "not_found" | "forbidden" = "not_found",
) {
  const listing = await findListingWithOwner(id);

  if (listing.ownerId !== ownerId) {
    if (ownershipFailure === "forbidden") {
      throw new ForbiddenError("Forbidden");
    }

    throw new NotFoundError("Listing not found");
  }

  return listing.listing;
}

// ── CRUD ──

export async function createListing(ownerId: string, data: CreateInput) {
  // Verify item ownership
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, data.inventoryItemId));

  if (!item || item.ownerId !== ownerId) {
    throw new NotFoundError("Inventory item not found");
  }

  if (item.lifecycleState === "archived" || item.lifecycleState === "sold") {
    throw new ConflictError("Cannot create listing for an archived or sold item");
  }

  const handle = data.handle || generateHandle(data.title);

  let listing;
  try {
    const [row] = await db
      .insert(channelListings)
      .values({
        inventoryItemId: data.inventoryItemId,
        channelId: data.channelId,
        title: data.title,
        description: data.description ?? null,
        priceCents: data.priceCents,
        currency: data.currency ?? "AUD",
        handle,
        status: "draft",
      })
      .returning();
    listing = row!;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      if (msg.includes("item_channel") || msg.includes("inventory_item_id")) {
        throw new ConflictError("A listing already exists for this item on this channel");
      }
      throw new ConflictError("This handle is already taken on this channel");
    }
    throw err;
  }

  await dispatchEvent({
    eventName: "channel_listing.created",
    category: "listings",
    actorId: ownerId,
    entityType: "channel_listing",
    entityId: listing!.id,
    channelId: data.channelId,
  });

  return listing!;
}

export async function listListings(
  ownerId: string,
  params: { limit: number; cursor?: string; channelId?: string; status?: string },
) {
  const conditions = [eq(inventoryItems.ownerId, ownerId)];

  if (params.cursor) {
    conditions.push(lt(channelListings.id, params.cursor));
  }
  if (params.channelId) {
    conditions.push(eq(channelListings.channelId, params.channelId));
  }
  if (params.status) {
    conditions.push(eq(channelListings.status, params.status));
  }

  const rows = await db
    .select({ listing: channelListings })
    .from(channelListings)
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .where(and(...conditions))
    .orderBy(desc(channelListings.id))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const items = hasMore ? rows.slice(0, params.limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.listing.id : null;

  // Fetch primary image for each listing (batch query)
  const itemIds = items.map((r) => r.listing.inventoryItemId);
  const primaryImages = itemIds.length > 0
    ? await db
        .select({
          inventoryItemId: inventoryItemImages.inventoryItemId,
          storageKey: inventoryItemImages.storageKey,
        })
        .from(inventoryItemImages)
        .where(
          and(
            sql`${inventoryItemImages.inventoryItemId} IN ${itemIds}`,
            eq(inventoryItemImages.isPrimary, true),
            eq(inventoryItemImages.status, "ready"),
          ),
        )
    : [];

  const imageByItemId = new Map(
    primaryImages.map((img) => [img.inventoryItemId, getPublicImageUrl(img.storageKey)]),
  );

  return {
    items: items.map((r) => ({
      ...r.listing,
      primaryImageUrl: imageByItemId.get(r.listing.inventoryItemId) ?? null,
    })),
    nextCursor,
  };
}

export async function getListing(id: string, ownerId: string) {
  return findOwnedListing(id, ownerId);
}

export async function updateListing(id: string, ownerId: string, data: UpdateInput) {
  const { version, ...updates } = data;

  const listing = await findOwnedListing(id, ownerId);

  if (listing.status === "archived") {
    throw new ConflictError("Cannot update an archived listing");
  }

  const newVersion = version + 1;
  const result = await db
    .update(channelListings)
    .set({ ...updates, version: newVersion, updatedAt: new Date() })
    .where(
      and(
        eq(channelListings.id, id),
        eq(channelListings.version, version),
      ),
    )
    .returning();

  if (result.length === 0) {
    throw new ConflictError(
      "Resource was modified by another request. Please retry with the latest version.",
    );
  }

  const updated = result[0]!;

  // Dispatch content_changed if description-related fields were updated
  const contentFields = ["description", "title", "priceCents"] as const;
  const hasContentChange = contentFields.some((f) => f in updates);
  if (hasContentChange) {
    await dispatchEvent({
      eventName: "channel_listing.content_changed",
      category: "listings",
      actorId: ownerId,
      entityType: "channel_listing",
      entityId: id,
      channelId: updated.channelId,
    }).catch((err: unknown) => {
      console.error("[listings] Failed to dispatch content_changed:", err);
    });
  }

  return updated;
}

// ── Status transitions ──

export async function transitionListingStatus(
  id: string,
  ownerId: string,
  to: ListingStatus,
  version: number,
) {
  const listing = await findOwnedListing(id, ownerId);
  const from = listing.status as ListingStatus;

  // Validate state transition
  transition(LISTING_STATUS_MACHINE, "channel listing", from, to);

  // Activation guards
  if (to === "active" && (from === "draft" || from === "paused")) {
    if (listing.hiddenAt !== null) {
      throw new ConflictError("Listing is hidden by moderation and cannot be published");
    }

    // Tier 1: seller readiness (vacation mode + shipping address; no Stripe check)
    await assertListingActivationReady(ownerId);
    await ensureItemListable(listing.inventoryItemId);
    await ensureItemHasReadyImage(listing.inventoryItemId);
  }

  const updates: Record<string, unknown> = {
    status: to,
    version: version + 1,
    updatedAt: new Date(),
  };

  // Set publishedAt on first activation
  if (to === "active" && !listing.publishedAt) {
    updates.publishedAt = new Date();
  }

  const result = await db
    .update(channelListings)
    .set(updates)
    .where(
      and(
        eq(channelListings.id, id),
        eq(channelListings.version, version),
      ),
    )
    .returning();

  if (result.length === 0) {
    throw new ConflictError(
      "Resource was modified by another request. Please retry with the latest version.",
    );
  }

  await dispatchEvent({
    eventName: "channel_listing.status_changed",
    category: "listings",
    actorId: ownerId,
    entityType: "channel_listing",
    entityId: id,
    channelId: listing.channelId,
    metadata: { from, to },
  });

  return result[0]!;
}

export async function getListingScore(id: string, ownerId: string) {
  await findOwnedListing(id, ownerId, "forbidden");

  const [score] = await db
    .select()
    .from(listingScores)
    .where(eq(listingScores.channelListingId, id))
    .limit(1);

  // Score not yet calculated — return zeroed defaults
  const photoScore = score?.photoScore ?? 0;
  const descriptionScore = score?.descriptionScore ?? 0;
  const completenessScore = score?.completenessScore ?? 0;
  const categoryScore = score?.categoryScore ?? 0;
  const total = score?.score ?? 0;
  const nudgeKey = (score?.nudgeKey as keyof typeof SCORE_NUDGE_MESSAGES | null) ?? null;
  const qualityTier = scoreToQualityTier(total);

  const nudgeMessage = nudgeKey ? (SCORE_NUDGE_MESSAGES[nudgeKey] ?? null) : null;

  return {
    score: total,
    photoScore,
    descriptionScore,
    completenessScore,
    categoryScore,
    qualityTier,
    nudgeKey,
    nudgeMessage,
  };
}

export async function archiveListing(id: string, ownerId: string, version: number) {
  const listing = await findOwnedListing(id, ownerId);

  if (listing.status === "archived") {
    return; // Idempotent
  }

  const from = listing.status as ListingStatus;
  transition(LISTING_STATUS_MACHINE, "channel listing", from, "archived");

  const result = await db
    .update(channelListings)
    .set({
      status: "archived",
      version: sql`${channelListings.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(channelListings.id, id),
        eq(channelListings.version, version),
      ),
    )
    .returning({ id: channelListings.id });

  if (result.length === 0) {
    throw new ConflictError("Resource was modified by another request. Please retry with the latest version.");
  }

  await dispatchEvent({
    eventName: "channel_listing.archived",
    category: "listings",
    actorId: ownerId,
    entityType: "channel_listing",
    entityId: id,
    channelId: listing.channelId,
  });
}
