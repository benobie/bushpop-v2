import { and, eq, inArray, lt, desc, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { orders, orderItems } from "@bushpop/db/schema";
import { NotFoundError, ConflictError } from "../../../../lib/errors.js";
import { formatOrder } from "../../store/orders/service.js";
import { dispatchEvent } from "../../../../lib/events.js";
import { redeemPickupCode } from "../../../../lib/pickup-code-service.js";

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

async function formatSellerOrder(
  order: typeof orders.$inferSelect,
  items: Array<typeof orderItems.$inferSelect>,
) {
  return {
    ...(await formatOrder(order, items)),
    shippingLabelUrl: order.shippingLabelUrl ?? null,
  };
}

/**
 * List orders for a seller (cursor-paginated by createdAt desc).
 */
export async function listSellerOrders(
  sellerId: string,
  channelId: string,
  opts: { status?: string; limit: number; cursor?: string },
) {
  const conditions: ReturnType<typeof eq>[] = [
    eq(orders.sellerId, sellerId),
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
    items: await Promise.all(data.map((o) => formatSellerOrder(o, itemMap.get(o.id) ?? []))),
    nextCursor: hasMore ? data[data.length - 1]!.createdAt.toISOString() : null,
  };
}

/**
 * Get a single order for a seller (ownership and channel verified).
 */
export async function getSellerOrder(orderId: string, sellerId: string, channelId: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.sellerId, sellerId), eq(orders.channelId, channelId)));

  if (!order) {
    throw new NotFoundError("Order not found");
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  return formatSellerOrder(order, items);
}

/**
 * Mark an order as shipped.
 *
 * - Transitions paid → shipped (compare-and-set)
 * - Records tracking number and carrier
 * - Emits order.shipped event
 */
export async function markOrderShipped(
  orderId: string,
  sellerId: string,
  opts: { trackingNumber: string; carrier: string },
) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.sellerId, sellerId)));

  if (!order) {
    throw new NotFoundError("Order not found");
  }

  if (order.status !== "paid") {
    throw new ConflictError(
      `Cannot mark order as shipped from status '${order.status}'. Order must be in 'paid' status.`,
    );
  }

  const result = await db
    .update(orders)
    .set({
      status: "shipped",
      trackingNumber: opts.trackingNumber,
      trackingCarrier: opts.carrier,
    })
    .where(and(eq(orders.id, orderId), eq(orders.status, "paid")))
    .returning({ id: orders.id });

  if (result.length === 0) {
    throw new ConflictError("Order was modified concurrently. Please refresh and try again.");
  }

  dispatchEvent({
    eventName: "order.shipped",
    category: "order",
    actorId: sellerId,
    entityType: "order",
    entityId: orderId,
    channelId: order.channelId,
    metadata: { trackingNumber: opts.trackingNumber, carrier: opts.carrier },
  }).catch((err) => {
    console.error("[orders] Failed to dispatch order.shipped:", err);
  });

  // Fetch updated order with items
  return getSellerOrder(orderId, sellerId, order.channelId);
}

/**
 * Confirm a pickup order's collection code at handover. Thin pass-through to
 * the shared pickup-code service (packages/api/src/lib/pickup-code-service.ts)
 * so the money-safety logic (CAS, instant payout release) lives in one place.
 */
export async function confirmOrderPickup(orderId: string, sellerId: string, code: string) {
  return redeemPickupCode(orderId, sellerId, code);
}
