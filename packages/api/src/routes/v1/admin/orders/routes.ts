import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import { idempotencyMiddleware } from "../../../../middleware/idempotency.js";
import { desc, eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { orders, refunds } from "@bushpop/db/schema";
import { dispatchEvent } from "../../../../lib/events.js";
import { NotFoundError } from "../../../../lib/errors.js";
import { processRefund } from "../../../../lib/refund-service.js";

const adminPreHandlers = [requireAuth, requireRole("admin"), idempotencyMiddleware];

export async function adminOrderRoutes(app: FastifyInstance) {
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
      preHandler: adminPreHandlers,
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
}
