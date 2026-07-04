import { and, eq, inArray, lt, desc } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { orders, orderItems } from "@bushpop/db/schema";
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

export function formatOrder(
  order: typeof orders.$inferSelect,
  items: Array<typeof orderItems.$inferSelect>,
) {
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

  return {
    items: data.map((o) => formatOrder(o, itemMap.get(o.id) ?? [])),
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
