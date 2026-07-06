import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import { listOrdersQuerySchema, sellerOrderResponseSchema, markShippedBodySchema } from "./schemas.js";
import { listSellerOrders, getSellerOrder, markOrderShipped } from "./service.js";

const sellerPreHandlers = [requireAuth, requireRole("seller")];

export async function sellerOrderRoutes(app: FastifyInstance) {
  // GET /api/v1/seller/orders — list seller's orders
  app.get(
    "/api/v1/seller/orders",
    {
      preHandler: sellerPreHandlers,
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
      preHandler: sellerPreHandlers,
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
      preHandler: sellerPreHandlers,
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
}
