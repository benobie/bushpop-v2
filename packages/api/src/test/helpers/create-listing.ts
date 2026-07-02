import { db } from "@bushpop/db/client";
import { inventoryItems, inventoryItemImages, channelListings } from "@bushpop/db/schema";
import { getBushpopChannel } from "./get-channel.js";

/**
 * Creates an inventory item + active channel listing in one call.
 * Inserts a ready image so listing activation guards pass.
 *
 * Returns the channel listing row (status: "active").
 */
export async function createActiveTestListing(
  ownerId: string,
  overrides?: {
    priceCents?: number;
    title?: string;
    channelId?: string;
  },
) {
  const channel = await getBushpopChannel();
  const channelId = overrides?.channelId ?? channel.id;

  const [item] = await db
    .insert(inventoryItems)
    .values({
      ownerId,
      condition: "good",
      lifecycleState: "for_sale",
    })
    .returning();

  await db.insert(inventoryItemImages).values({
    inventoryItemId: item!.id,
    storageKey: `items/${item!.id}/primary.jpg`,
    status: "ready",
    confirmedAt: new Date(),
  });

  const [listing] = await db
    .insert(channelListings)
    .values({
      inventoryItemId: item!.id,
      channelId,
      title: overrides?.title ?? "Test Listing",
      priceCents: overrides?.priceCents ?? 5000,
      currency: "AUD",
      handle: `test-listing-${item!.id.slice(-6).toLowerCase()}`,
      status: "active",
      publishedAt: new Date(),
    })
    .returning();

  return listing!;
}
