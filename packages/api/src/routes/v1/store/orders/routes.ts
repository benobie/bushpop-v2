import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { listOrdersQuerySchema, orderResponseSchema } from "./schemas.js";
import { listBuyerOrders, getBuyerOrder } from "./service.js";

export async function storeOrderRoutes(app: FastifyInstance) {
  // GET /api/v1/store/orders — list buyer's orders
  app.get(
    "/api/v1/store/orders",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["Store - Orders"],
        summary: "List buyer's orders",
        querystring: listOrdersQuerySchema,
        response: {
          200: z.object({
            items: z.array(orderResponseSchema),
            nextCursor: z.string().nullable(),
          }),
        },
      },
    },
    async (request) => {
      const query = request.query as z.infer<typeof listOrdersQuerySchema>;
      return listBuyerOrders(request.user!.id, request.channel!.id, {
        status: query.status,
        limit: query.limit,
        cursor: query.cursor,
      });
    },
  );

  // GET /api/v1/store/orders/:id — get buyer order detail
  app.get(
    "/api/v1/store/orders/:id",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["Store - Orders"],
        summary: "Get buyer order detail",
        params: z.object({ id: z.string().length(26) }),
        response: { 200: orderResponseSchema },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      return getBuyerOrder(id, request.user!.id, request.channel!.id);
    },
  );
}
