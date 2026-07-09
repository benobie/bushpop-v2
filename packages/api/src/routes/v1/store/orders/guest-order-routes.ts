import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { orders, orderItems } from "@bushpop/db/schema";
import { NotFoundError } from "../../../../lib/errors.js";
import { verifyGuestOrderToken } from "../../../../lib/guest-order-access.js";
import { orderResponseSchema } from "./schemas.js";
import { formatOrder } from "./service.js";

// BF-08 guest commerce — lets a guest reach their own order without a live
// session (email link, cookie cleared, different device). Deliberately a
// separate route module — no requireAuth preHandler; the token itself IS the
// ownership proof (see guest-order-access.ts). Reuses formatOrder from
// ./service.ts, which already excludes seller-only fields (see PR #74's
// formatSellerOrder split) — never format via the seller path here.
async function getOrderForGuestToken(orderId: string, token: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));

  // Same 404 either way — a wrong token must not distinguish "no such
  // order" from "order exists but token doesn't match" (no enumeration).
  if (!order || !verifyGuestOrderToken(order.id, order.buyerId, token)) {
    throw new NotFoundError("Order not found");
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return formatOrder(order, items);
}

export async function storeGuestOrderRoutes(app: FastifyInstance) {
  // GET /api/v1/store/orders/:id/guest?token=... — unauthenticated, token-gated
  app.get(
    "/api/v1/store/orders/:id/guest",
    {
      // Own array literal, not shared with any other route — @fastify/rate-limit
      // mutates whatever preHandler array a route's config points at.
      preHandler: [],
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute", keyGenerator: (req: { ip: string }) => req.ip },
      },
      schema: {
        tags: ["Store - Orders"],
        summary: "Get an order via its guest access token (no session required)",
        params: z.object({ id: z.string().length(26) }),
        querystring: z.object({ token: z.string().min(1) }),
        response: { 200: orderResponseSchema },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { token } = request.query as { token: string };
      return getOrderForGuestToken(id, token);
    },
  );
}
