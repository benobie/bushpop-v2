/**
 * Direct-DB listing seed for E2E specs that need a ready-to-buy listing
 * without re-driving the sell wizard UI (already covered end-to-end by
 * sell-wizard.spec.ts). Mirrors packages/db/src/seed.ts's seedDevListings().
 */
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { channels } from "@bushpop/db/schema";
import { inventoryItems, inventoryItemImages, channelListings } from "@bushpop/db/schema";

export interface SeededListing {
  id: string;
  handle: string;
  title: string;
  priceCents: number;
  shippingClass: string;
}

/**
 * Creates one active, image-ready listing owned by `sellerId` on the
 * `bushpop` channel. No shipping_option set — defaults to "buyer_pays" per
 * order-totals.ts, so the Buyer Protection fee is > 0 and actually renders.
 */
export async function createActiveListing(sellerId: string): Promise<SeededListing> {
  const [channel] = await db.select({ id: channels.id }).from(channels).where(eq(channels.slug, "bushpop"));
  if (!channel) {
    throw new Error("bushpop channel not seeded — run packages/db/src/seed.ts first");
  }

  const [item] = await db
    .insert(inventoryItems)
    .values({
      ownerId: sellerId,
      title: "E2E Checkout Test Jacket",
      description: "Seeded directly for the checkout E2E spec.",
      availabilityStatus: "available",
      lifecycleState: "for_sale",
      brand: "Test Brand",
      size: "M",
      colour: "Blue",
      condition: "good",
      shippingClass: "m",
    })
    .returning();

  await db.insert(inventoryItemImages).values({
    inventoryItemId: item!.id,
    storageKey: `items/${item!.id}/primary.jpg`,
    contentType: "image/jpeg",
    status: "ready",
    position: 0,
    isPrimary: true,
    confirmedAt: new Date(),
  });

  const priceCents = 5000;
  const handle = `e2e-checkout-jacket-${item!.id.slice(-6).toLowerCase()}`;

  await db.insert(channelListings).values({
    inventoryItemId: item!.id,
    channelId: channel.id,
    title: "E2E Checkout Test Jacket",
    description: "Seeded directly for the checkout E2E spec.",
    priceCents,
    currency: "AUD",
    handle,
    status: "active",
    publishedAt: new Date(),
  });

  return { id: item!.id, handle, title: "E2E Checkout Test Jacket", priceCents, shippingClass: "m" };
}
