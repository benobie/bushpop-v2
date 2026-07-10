import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import { idempotencyMiddleware } from "../../../../middleware/idempotency.js";
import { desc, eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { orders, pickupCodes, refunds } from "@bushpop/db/schema";
import { dispatchEvent } from "../../../../lib/events.js";
import { NotFoundError, ConflictError } from "../../../../lib/errors.js";
import { MAX_PICKUP_CODE_ATTEMPTS } from "../../../../lib/pickup-code-service.js";
import { processRefund } from "../../../../lib/refund-service.js";
import {
  listOrdersQuerySchema,
  orderSummarySchema,
  orderDetailSchema,
  refundOrderBodySchema,
} from "./schemas.js";
import { listOrders, getOrderDetail } from "./service.js";

// `@fastify/rate-limit`'s onRoute hook pushes its handler onto whatever array
// object is passed as `preHandler`, for every route, whether or not that route
// declares `config.rateLimit`. Two routes sharing one array *reference* would
// share a single limiter bucket, and a per-request guard means only the first
// registered route's limit would ever apply — silently. Both money-movement
// routes below (refund, cancel) sit on these arrays. Build a fresh one per
// route, matching the factory pattern in seller/drafts and seller/orders.
const adminReadPreHandlers = () => [requireAuth, requireRole("admin")];
const adminPreHandlers = () => [requireAuth, requireRole("admin"), idempotencyMiddleware];

export async function adminOrderRoutes(app: FastifyInstance) {
  // GET /api/v1/admin/orders — list orders, optional status filter
  app.get(
    "/api/v1/admin/orders",
    {
      preHandler: adminReadPreHandlers(),
      schema: {
        tags: ["Admin - Orders"],
        summary: "List orders (admin only)",
        querystring: listOrdersQuerySchema,
        response: {
          200: z.object({
            items: z.array(orderSummarySchema),
            total: z.number(),
            page: z.number(),
            limit: z.number(),
            totalPages: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const { status, page, limit } = request.query as z.infer<typeof listOrdersQuerySchema>;
      return listOrders({ status, page, limit });
    },
  );

  // GET /api/v1/admin/orders/:id — order detail (items, payout hold, refunds, event timeline)
  app.get(
    "/api/v1/admin/orders/:id",
    {
      preHandler: adminReadPreHandlers(),
      schema: {
        tags: ["Admin - Orders"],
        summary: "Get order detail (admin only)",
        params: z.object({ id: z.string().length(26) }),
        response: { 200: orderDetailSchema },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      return getOrderDetail(id);
    },
  );

  // POST /api/v1/admin/orders/:id/refund — refund a paid order via the processor
  //
  // Runbook T-0 step 3 depends on this path. Refunds the buyer's original
  // PaymentIntent (or reverses the transfer post-release) through the SAME
  // processRefund() core the seller-initiated + admin-cancel paths use — no
  // Bushpop-held-funds refund exists anywhere (AFSL rule). Every call writes
  // an append-only marketplace_events row (dispatchEvent, category "order")
  // as the audit trail — never mutated, only ever inserted.
  app.post(
    "/api/v1/admin/orders/:id/refund",
    {
      preHandler: adminPreHandlers(),
      schema: {
        tags: ["Admin - Orders"],
        summary: "Refund a paid order via the processor (admin only)",
        params: z.object({ id: z.string().length(26) }),
        body: refundOrderBodySchema.optional(),
        response: {
          200: z.object({
            orderId: z.string(),
            status: z.string(),
            refundId: z.string().nullable(),
          }),
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { reason } = (request.body as z.infer<typeof refundOrderBodySchema> | undefined) ?? {
        reason: "admin_refund",
      };

      // NOTE: no refund-confirmation email enqueue here — that email type
      // (PR #65, held for Ben) doesn't exist on this branch yet. Once #65
      // merges, wire an `enqueueEmail({ type: "refund_confirmation_buyer", orderId: id })`
      // call here (fire-and-forget, matching the pattern elsewhere in this
      // file) — do not build a parallel refund-email path in the meantime.
      await processRefund(id, request.user!.id, reason, { isAdmin: true });

      const [order] = await db
        .select({ id: orders.id, status: orders.status, channelId: orders.channelId })
        .from(orders)
        .where(eq(orders.id, id));

      if (!order) {
        throw new NotFoundError("Order not found");
      }

      const [refundRow] = await db
        .select({ stripeRefundId: refunds.stripeRefundId })
        .from(refunds)
        .where(eq(refunds.orderId, id))
        .orderBy(desc(refunds.createdAt))
        .limit(1);

      // Fire-and-forget audit event — mirrors the admin-cancel route above.
      // TODO(AUDIT-010): migrate to transactional outbox (same debt as cancel).
      dispatchEvent({
        eventName: "order.refunded",
        category: "order",
        actorId: request.user!.id,
        entityType: "order",
        entityId: id,
        channelId: order.channelId,
        metadata: { refundedBy: "admin", reason, refundId: refundRow?.stripeRefundId ?? null },
      }).catch((err) => {
        request.log.error({ err }, "[admin/orders] Failed to dispatch order.refunded");
      });

      return {
        orderId: id,
        status: order.status,
        refundId: refundRow?.stripeRefundId ?? null,
      };
    },
  );

  // POST /api/v1/admin/orders/:id/cancel — cancel a paid order
  //
  // AUDIT-009 fix: delegates to processRefund() so the Stripe refund (and, on
  // the post-release path, the transfer reversal) runs through the same
  // payment_operations WAL + CAS guarded state machine that seller-initiated
  // refunds use. Inventory and listings are restored by restoreInventory inside
  // processRefund. The terminal order status is `cancelled` (not `refunded`),
  // distinguishing admin cancellations from refunds in reporting.
  app.post(
    "/api/v1/admin/orders/:id/cancel",
    {
      preHandler: adminPreHandlers(),
      schema: {
        tags: ["Admin - Orders"],
        summary: "Cancel a paid order (admin only)",
        params: z.object({ id: z.string().length(26) }),
        // Body is intentionally not declared in the schema so Fastify accepts
        // requests with or without a payload. The handler reads `reason` from
        // `request.body` defensively (defaulting to "admin_cancellation").
        response: {
          200: z.object({
            orderId: z.string(),
            status: z.string(),
            refundId: z.string().nullable(),
          }),
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const reason =
        (request.body as { reason?: string } | undefined)?.reason ?? "admin_cancellation";

      await processRefund(id, request.user!.id, reason, {
        isAdmin: true,
        terminalOrderStatus: "cancelled",
      });

      // Re-load to return the canonical post-state.
      const [order] = await db
        .select({ id: orders.id, status: orders.status, channelId: orders.channelId })
        .from(orders)
        .where(eq(orders.id, id));

      if (!order) {
        throw new NotFoundError("Order not found");
      }

      const [refundRow] = await db
        .select({ stripeRefundId: refunds.stripeRefundId })
        .from(refunds)
        .where(eq(refunds.orderId, id))
        .orderBy(desc(refunds.createdAt))
        .limit(1);

      // Fire-and-forget audit event. Best-effort; the refund itself is already
      // committed to the WAL via payment_operations.
      // TODO(AUDIT-010): migrate to transactional outbox so cancellation events
      // cannot be lost between Stripe success and event dispatch.
      dispatchEvent({
        eventName: "order.cancelled",
        category: "order",
        actorId: request.user!.id,
        entityType: "order",
        entityId: id,
        channelId: order.channelId,
        metadata: { cancelledBy: "admin", reason, refundId: refundRow?.stripeRefundId ?? null },
      }).catch((err) => {
        request.log.error({ err }, "[admin/orders] Failed to dispatch order.cancelled");
      });

      return {
        orderId: id,
        status: order.status,
        refundId: refundRow?.stripeRefundId ?? null,
      };
    },
  );

  // POST /api/v1/admin/orders/:id/reset-pickup-attempts — clear the pickup-code
  // lockout on an order.
  //
  // The seller-side redemption lockout at MAX_PICKUP_CODE_ATTEMPTS is permanent
  // and not time-windowed, so a buyer who has already collected the goods can
  // jam an order's automated completion for good by feeding the seller wrong
  // codes. There is otherwise no route back. Support-operated, audited.
  //
  // This does NOT move money and does not complete the order — it only restores
  // the seller's ability to attempt a redemption, which then runs every
  // pre-existing check. An already-redeemed code is left alone: re-opening a
  // completed handover would be a fresh attempt surface against a code whose
  // holder has already used it.
  app.post(
    "/api/v1/admin/orders/:id/reset-pickup-attempts",
    {
      preHandler: adminPreHandlers(),
      schema: {
        tags: ["Admin - Orders"],
        summary: "Reset the pickup-code attempt lockout on an order (admin only)",
        params: z.object({ id: z.string().length(26) }),
        body: z.object({ reason: z.string().min(1).max(500) }),
        response: {
          200: z.object({
            orderId: z.string(),
            attempts: z.number(),
            maxAttempts: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason: string };

      const [pickup] = await db.select().from(pickupCodes).where(eq(pickupCodes.orderId, id));
      if (!pickup) {
        throw new NotFoundError("No pickup code exists for this order");
      }
      if (pickup.redeemedAt !== null) {
        throw new ConflictError("Pickup code has already been redeemed.");
      }

      const previousAttempts = pickup.attempts;

      await db
        .update(pickupCodes)
        .set({ attempts: 0 })
        .where(eq(pickupCodes.id, pickup.id));

      dispatchEvent({
        eventName: "pickup.attempts_reset",
        category: "order",
        actorId: request.user!.id,
        entityType: "order",
        entityId: id,
        metadata: { reason, previousAttempts, resetBy: "admin" },
      }).catch((err) => {
        request.log.error({ err }, "[admin/orders] Failed to dispatch pickup.attempts_reset");
      });

      return { orderId: id, attempts: 0, maxAttempts: MAX_PICKUP_CODE_ATTEMPTS };
    },
  );
}
