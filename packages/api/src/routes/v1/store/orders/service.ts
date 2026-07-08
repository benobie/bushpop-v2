import { and, eq, inArray, lt, desc } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { orders, orderItems, channelListings, inventoryItems, inventoryItemImages } from "@bushpop/db/schema";
import { getPublicImageUrl } from "../../../../lib/image-url.js";
import { NotFoundError } from "../../../../lib/errors.js";

// ── Helpers ──

function groupItemsByOrder(items: Array<typeof orderItems.$inferSelect>) {
  const map = new Map<string, Array<typeof orderItems.$inferSelect>>();
  for (const item of items) {
    if (!map.has(item.orderId)) {
      map.set(item.orderId, []);
    }
    map.get(item.orderId)!.push(item);
  }
  return map;
}

interface OrderItemEnrichment {
  title: string | null;
  coverImage: string | null;
  handle: string | null;
  size: string | null;
  condition: string | null;
  brand: string | null;
}

const EMPTY_ENRICHMENT: OrderItemEnrichment = {
  title: null,
  coverImage: null,
  handle: null,
  size: null,
  condition: null,
  brand: null,
};

/**
 * U1 checkout/confirmation restyle: order items only store channelListingId
 * + the price snapshot; title/image/handle/size/condition/brand are looked
 * up fresh (same "no snapshot" approach as store/cart/service.ts
 * enrichCartItems — a since-deleted listing/inventory item just falls back
 * to nulls rather than hiding the order line).
 */
async function enrichOrderItems(
  items: Array<typeof orderItems.$inferSelect>,
): Promise<Map<string, OrderItemEnrichment>> {
  const result = new Map<string, OrderItemEnrichment>();
  if (items.length === 0) return result;

  const listingIds = [...new Set(items.map((i) => i.channelListingId))];

  const listings = await db
    .select({
      id: channelListings.id,
      title: channelListings.title,
      handle: channelListings.handle,
      inventoryItemId: channelListings.inventoryItemId,
      size: inventoryItems.size,
      condition: inventoryItems.condition,
      brand: inventoryItems.brand,
    })
    .from(channelListings)
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .where(inArray(channelListings.id, listingIds));

  const inventoryItemIds = [...new Set(listings.map((l) => l.inventoryItemId))];
  const images = inventoryItemIds.length
    ? await db
        .select({
          inventoryItemId: inventoryItemImages.inventoryItemId,
          storageKey: inventoryItemImages.storageKey,
          isPrimary: inventoryItemImages.isPrimary,
          position: inventoryItemImages.position,
        })
        .from(inventoryItemImages)
        .where(
          and(
            inArray(inventoryItemImages.inventoryItemId, inventoryItemIds),
            eq(inventoryItemImages.status, "ready"),
          ),
        )
    : [];

  const byInventoryItem = new Map<string, typeof images>();
  for (const img of images) {
    const bucket = byInventoryItem.get(img.inventoryItemId) ?? [];
    bucket.push(img);
    byInventoryItem.set(img.inventoryItemId, bucket);
  }
  const coverByInventoryItem = new Map<string, string>();
  for (const [id, bucket] of byInventoryItem) {
    const primary = bucket.find((img) => img.isPrimary);
    const chosen = primary ?? [...bucket].sort((a, b) => a.position - b.position)[0];
    if (chosen) coverByInventoryItem.set(id, chosen.storageKey);
  }

  const listingById = new Map(listings.map((l) => [l.id, l]));

  for (const item of items) {
    const listing = listingById.get(item.channelListingId);
    if (!listing) {
      result.set(item.id, EMPTY_ENRICHMENT);
      continue;
    }
    const coverKey = coverByInventoryItem.get(listing.inventoryItemId);
    result.set(item.id, {
      title: listing.title ?? null,
      handle: listing.handle ?? null,
      coverImage: coverKey ? getPublicImageUrl(coverKey) : null,
      size: listing.size ?? null,
      condition: listing.condition ?? null,
      brand: listing.brand ?? null,
    });
  }

  return result;
}

export async function formatOrder(
  order: typeof orders.$inferSelect,
  items: Array<typeof orderItems.$inferSelect>,
  precomputedEnrichment?: Map<string, OrderItemEnrichment>,
) {
  const enrichment = precomputedEnrichment ?? (await enrichOrderItems(items));
  return {
    id: order.id,
    checkoutSessionId: order.checkoutSessionId,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    channelId: order.channelId,
    status: order.status,
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    platformFeeCents: order.platformFeeCents,
    buyerProtectionFeeCents: order.buyerProtectionFeeCents,
    sellerProceedsCents: order.sellerProceedsCents,
    totalCents: order.totalCents,
    currency: order.currency,
    shippingAddressSnapshot: (order.shippingAddressSnapshot as Record<string, unknown> | null) ?? null,
    senderAddressSnapshot: (order.senderAddressSnapshot as Record<string, unknown> | null) ?? null,
    trackingNumber: order.trackingNumber ?? null,
    trackingCarrier: order.trackingCarrier ?? null,
    stripePaymentIntentId: order.stripePaymentIntentId ?? null,
    items: items.map((i) => ({
      id: i.id,
      orderId: i.orderId,
      channelListingId: i.channelListingId,
      priceCents: i.priceCents,
      currency: i.currency,
      createdAt: i.createdAt.toISOString(),
      ...(enrichment.get(i.id) ?? EMPTY_ENRICHMENT),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

// ── Buyer order queries ──

/**
 * List orders for a buyer (cursor-paginated by createdAt desc).
 */
export async function listBuyerOrders(
  buyerId: string,
  channelId: string,
  opts: { status?: string; limit: number; cursor?: string },
) {
  const conditions: ReturnType<typeof eq>[] = [
    eq(orders.buyerId, buyerId),
    eq(orders.channelId, channelId),
  ];
  if (opts.status) {
    conditions.push(eq(orders.status, opts.status));
  }
  if (opts.cursor) {
    conditions.push(lt(orders.createdAt, new Date(opts.cursor)));
  }

  const rows = await db
    .select()
    .from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const data = hasMore ? rows.slice(0, opts.limit) : rows;

  const orderIds = data.map((r) => r.id);
  const itemRows =
    orderIds.length > 0
      ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
      : [];

  const itemMap = groupItemsByOrder(itemRows);

  // Enrich once across all orders' items — formatOrder's own batching would
  // otherwise re-query listings/images per order (N+1 across the page).
  const sharedEnrichment = await enrichOrderItems(itemRows);

  return {
    items: await Promise.all(
      data.map((o) => formatOrder(o, itemMap.get(o.id) ?? [], sharedEnrichment)),
    ),
    nextCursor: hasMore ? data[data.length - 1]!.createdAt.toISOString() : null,
  };
}

/**
 * Get a single order for a buyer (ownership and channel verified).
 */
export async function getBuyerOrder(orderId: string, buyerId: string, channelId: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.buyerId, buyerId), eq(orders.channelId, channelId)));

  if (!order) {
    throw new NotFoundError("Order not found");
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  return formatOrder(order, items);
}
