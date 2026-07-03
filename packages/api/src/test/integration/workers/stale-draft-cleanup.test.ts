import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@bushpop/db/client";
import { channelListings, inventoryItems, inventoryItemImages } from "@bushpop/db/schema";
import { createTestUser } from "../../helpers/create-user.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";

const deletedKeys: string[] = [];

vi.mock("../../../lib/r2.js", async () => {
  const { mockR2 } = await import("../../helpers/r2-mock.js");
  return {
    ...mockR2(),
    deleteObject: vi.fn(async (key: string) => {
      deletedKeys.push(key);
    }),
  };
});

import { cleanupStaleDrafts } from "../../../workers/image-cleanup.js";

const THIRTY_ONE_DAYS_AGO = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

async function makeDraft(
  ownerId: string,
  opts: { updatedAt: Date; withImage?: boolean; withListing?: boolean; lifecycle?: string },
) {
  const [item] = await db
    .insert(inventoryItems)
    .values({
      ownerId,
      title: "Stale candidate",
      lifecycleState: opts.lifecycle ?? "owned",
      updatedAt: opts.updatedAt,
    })
    .returning();

  let imageId: string | null = null;
  if (opts.withImage) {
    imageId = ulid();
    await db.insert(inventoryItemImages).values({
      id: imageId,
      inventoryItemId: item!.id,
      storageKey: `items/${item!.id}/${imageId}.jpg`,
      status: "ready",
    });
  }

  if (opts.withListing) {
    const channel = await getBushpopChannel();
    await db.insert(channelListings).values({
      inventoryItemId: item!.id,
      channelId: channel.id,
      title: "Listed item",
      priceCents: 1000,
      handle: `listed-${item!.id.toLowerCase()}`,
      status: "active",
    });
  }

  return { itemId: item!.id, imageId };
}

describe("stale draft cleanup (task 11)", () => {
  let ownerId: string;

  beforeEach(async () => {
    deletedKeys.length = 0;
    const user = await createTestUser();
    ownerId = user.id;
  });

  it("archives >30d drafts, deleting originals + all derived variants", async () => {
    const { itemId, imageId } = await makeDraft(ownerId, {
      updatedAt: THIRTY_ONE_DAYS_AGO,
      withImage: true,
    });

    const { archived } = await cleanupStaleDrafts();
    expect(archived).toBe(1);

    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
    expect(item!.lifecycleState).toBe("archived");

    const images = await db
      .select()
      .from(inventoryItemImages)
      .where(eq(inventoryItemImages.inventoryItemId, itemId));
    expect(images).toHaveLength(0);

    expect(deletedKeys).toEqual(
      expect.arrayContaining([
        `items/${itemId}/${imageId}.jpg`,
        `items/${itemId}/thumb-320/${imageId}.webp`,
        `items/${itemId}/card-800/${imageId}.webp`,
        `items/${itemId}/pdp-1600/${imageId}.webp`,
      ]),
    );
  });

  it("leaves fresh drafts alone", async () => {
    const { itemId } = await makeDraft(ownerId, { updatedAt: new Date(), withImage: true });
    const { archived } = await cleanupStaleDrafts();
    expect(archived).toBe(0);
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
    expect(item!.lifecycleState).toBe("owned");
  });

  it("leaves stale items WITH a listing alone (not drafts)", async () => {
    const { itemId } = await makeDraft(ownerId, {
      updatedAt: THIRTY_ONE_DAYS_AGO,
      withListing: true,
    });
    const { archived } = await cleanupStaleDrafts();
    expect(archived).toBe(0);
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
    expect(item!.lifecycleState).toBe("owned");
  });

  it("ignores non-owned lifecycles (published/sold inventory)", async () => {
    await makeDraft(ownerId, { updatedAt: THIRTY_ONE_DAYS_AGO, lifecycle: "for_sale" });
    const { archived } = await cleanupStaleDrafts();
    expect(archived).toBe(0);
  });
});
