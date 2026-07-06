import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { orders, payoutHolds } from "@bushpop/db/schema";

/**
 * List payout holds for a seller's own orders (paginated), plus a
 * per-status total computed by the DB (never in app code — money-display
 * only, no new arithmetic outside SQL/formatMoney).
 */
export async function listSellerPayouts(
  sellerId: string,
  channelId: string,
  opts: { status?: string; page: number; limit: number },
) {
  const offset = (opts.page - 1) * opts.limit;

  const scopeConditions = [eq(orders.sellerId, sellerId), eq(orders.channelId, channelId)];
  const where = opts.status
    ? and(...scopeConditions, eq(payoutHolds.status, opts.status))
    : and(...scopeConditions);

  const [items, countResult, totalsByStatus] = await Promise.all([
    db
      .select({
        id: payoutHolds.id,
        orderId: payoutHolds.orderId,
        status: payoutHolds.status,
        amountCents: payoutHolds.amountCents,
        currency: payoutHolds.currency,
        createdAt: payoutHolds.createdAt,
      })
      .from(payoutHolds)
      .innerJoin(orders, eq(payoutHolds.orderId, orders.id))
      .where(where)
      .orderBy(desc(payoutHolds.createdAt))
      .limit(opts.limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(payoutHolds)
      .innerJoin(orders, eq(payoutHolds.orderId, orders.id))
      .where(where),
    db
      .select({
        status: payoutHolds.status,
        totalCents: sql<number>`sum(${payoutHolds.amountCents})::int`,
      })
      .from(payoutHolds)
      .innerJoin(orders, eq(payoutHolds.orderId, orders.id))
      .where(and(...scopeConditions))
      .groupBy(payoutHolds.status),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    items: items.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    totalsByStatus,
    page: opts.page,
    limit: opts.limit,
    total,
    totalPages: Math.ceil(total / opts.limit) || 1,
  };
}
