import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import {
  listOrdersQuerySchema,
  sellerOrderResponseSchema,
  markShippedBodySchema,
  confirmPickupBodySchema,
  confirmPickupResponseSchema,
} from "./schemas.js";
import { listSellerOrders, getSellerOrder, markOrderShipped, confirmOrderPickup } from "./service.js";

// @fastify/rate-limit mutates the route's preHandler array when route-specific
// limits are enabled. Always build a fresh array so the pickup-confirm limit
// cannot leak onto sibling seller-order routes.
const sellerPreHandlers = () => [requireAuth, requireRole("seller")];

export async function sellerOrderRoutes(app: FastifyInstance) {
  // GET /api/v1/seller/orders — list seller's orders
  app.get(
    "/api/v1/seller/orders",
    {
      preHandler: sellerPreHandlers(),
      schema: {
        tags: ["Seller - Orders"],
        summary: "List seller's orders",
        querystring: listOrdersQuerySchema,
        response: {
          200: z.object({
            items: z.array(sellerOrderResponseSchema),
            nextCursor: z.string().nullable(),
          }),
        },
      },
    },
    async (request) => {
      const query = request.query as z.infer<typeof listOrdersQuerySchema>;
      return listSellerOrders(request.user!.id, request.channel!.id, {
        status: query.status,
        limit: query.limit,
        cursor: query.cursor,
      });
    },
  );

  // GET /api/v1/seller/orders/:id — seller order detail
  app.get(
    "/api/v1/seller/orders/:id",
    {
      preHandler: sellerPreHandlers(),
      schema: {
        tags: ["Seller - Orders"],
        summary: "Get seller order detail",
        params: z.object({ id: z.string().length(26) }),
        response: { 200: sellerOrderResponseSchema },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      return getSellerOrder(id, request.user!.id, request.channel!.id);
    },
  );

  // PATCH /api/v1/seller/orders/:id/ship — mark shipped
  app.patch(
    "/api/v1/seller/orders/:id/ship",
    {
      preHandler: sellerPreHandlers(),
      schema: {
        tags: ["Seller - Orders"],
        summary: "Mark order as shipped",
        params: z.object({ id: z.string().length(26) }),
        body: markShippedBodySchema,
        response: { 200: sellerOrderResponseSchema },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof markShippedBodySchema>;
      return markOrderShipped(id, request.user!.id, {
        trackingNumber: body.trackingNumber,
        carrier: body.carrier,
      });
    },
  );

  // PATCH /api/v1/seller/orders/:id/confirm-pickup — redeem the buyer's
  // collection code at handover. Rate-limited per-seller against a 6-digit
  // brute force; server.ts registers @fastify/rate-limit on the preHandler
  // hook so req.user is available to the keyGenerator here.
  app.patch(
    "/api/v1/seller/orders/:id/confirm-pickup",
    {
      preHandler: sellerPreHandlers(),
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "5 minutes",
          keyGenerator: (req: { user?: { id: string } | null; ip: string }) =>
            req.user?.id ?? req.ip,
          allowList: () => process.env.NODE_ENV === "test",
        },
      },
      schema: {
        tags: ["Seller - Orders"],
        summary: "Confirm pickup handover via the buyer's collection code",
        params: z.object({ id: z.string().length(26) }),
        body: confirmPickupBodySchema,
        response: { 200: confirmPickupResponseSchema },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = request.body as z.infer<typeof confirmPickupBodySchema>;
      return confirmOrderPickup(id, request.user!.id, body.code);
    },
  );
}
