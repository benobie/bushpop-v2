import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  orders,
  orderItems,
  channelListings,
  payoutHolds,
  refunds,
  marketplaceEvents,
  user,
} from "@bushpop/db/schema";
import { NotFoundError } from "../../../../lib/errors.js";

interface ListOrdersInput {
  status?: string;
  page: number;
  limit: number;
}

export async function listOrders({ status, page, limit }: ListOrdersInput) {
  const offset = (page - 1) * limit;
  const where = status ? eq(orders.status, status) : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: orders.id,
        status: orders.status,
        buyerId: orders.buyerId,
        sellerId: orders.sellerId,
        totalCents: orders.totalCents,
        currency: orders.currency,
        trackingNumber: orders.trackingNumber,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    items: items.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getOrderDetail(id: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) {
    throw new NotFoundError("Order not found");
  }

  const [buyer] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, order.buyerId));
  const [seller] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, order.sellerId));

  const items = await db
    .select({
      id: orderItems.id,
      channelListingId: orderItems.channelListingId,
      title: channelListings.title,
      priceCents: orderItems.priceCents,
    })
    .from(orderItems)
    .leftJoin(channelListings, eq(orderItems.channelListingId, channelListings.id))
    .where(eq(orderItems.orderId, id));

  const [payoutHold] = await db.select().from(payoutHolds).where(eq(payoutHolds.orderId, id));

  const refundRows = await db
    .select()
    .from(refunds)
    .where(eq(refunds.orderId, id))
    .orderBy(desc(refunds.createdAt));

  const events = await db
    .select()
    .from(marketplaceEvents)
    .where(and(eq(marketplaceEvents.entityType, "order"), eq(marketplaceEvents.entityId, id)))
    .orderBy(desc(marketplaceEvents.createdAt))
    .limit(50);

  return {
    id: order.id,
    status: order.status,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    totalCents: order.totalCents,
    currency: order.currency,
    trackingNumber: order.trackingNumber,
    trackingCarrier: order.trackingCarrier,
    lastTrackingStatus: order.lastTrackingStatus,
    lastTrackingEventAt: order.lastTrackingEventAt?.toISOString() ?? null,
    deliveryConfirmedAt: order.deliveryConfirmedAt?.toISOString() ?? null,
    slaDeadlineAt: order.slaDeadlineAt?.toISOString() ?? null,
    stripePaymentIntentId: order.stripePaymentIntentId,
    stripeTransferId: order.stripeTransferId,
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    platformFeeCents: order.platformFeeCents,
    buyerProtectionFeeCents: order.buyerProtectionFeeCents,
    sellerProceedsCents: order.sellerProceedsCents,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    buyer: buyer ? { id: buyer.id, name: buyer.name, email: buyer.email } : null,
    seller: seller ? { id: seller.id, name: seller.name, email: seller.email } : null,
    items: items.map((it) => ({ ...it, title: it.title ?? null })),
    payoutHold: payoutHold
      ? {
          id: payoutHold.id,
          status: payoutHold.status,
          amountCents: payoutHold.amountCents,
          transferId: payoutHold.transferId,
          releaseAttempts: payoutHold.releaseAttempts,
          failureReason: payoutHold.failureReason,
        }
      : null,
    refunds: refundRows.map((r) => ({
      id: r.id,
      status: r.status,
      amountCents: r.amountCents,
      reason: r.reason,
      stripeRefundId: r.stripeRefundId,
      createdAt: r.createdAt.toISOString(),
    })),
    events: events.map((e) => ({
      id: e.id,
      eventName: e.eventName,
      actorId: e.actorId,
      metadata: e.metadata,
      deliveryStatus: e.deliveryStatus,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
