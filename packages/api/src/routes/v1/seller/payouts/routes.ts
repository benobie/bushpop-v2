import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import { listPayoutsQuerySchema, payoutsListResponseSchema } from "./schemas.js";
import { listSellerPayouts } from "./service.js";

// Factory, not a shared array: @fastify/rate-limit pushes its handler onto the
// preHandler array it is handed, for every route. Two routes sharing one array
// reference would silently share a single limiter bucket.
const sellerPreHandlers = () => [requireAuth, requireRole("seller")];

export async function sellerPayoutRoutes(app: FastifyInstance) {
  // GET /api/v1/seller/payouts — list the caller's own payout holds (read-only)
  app.get(
    "/api/v1/seller/payouts",
    {
      preHandler: sellerPreHandlers(),
      schema: {
        tags: ["Seller - Payouts"],
        summary: "List seller's own payout holds",
        querystring: listPayoutsQuerySchema,
        response: { 200: payoutsListResponseSchema },
      },
    },
    async (request) => {
      const { page, limit, status } = request.query as z.infer<typeof listPayoutsQuerySchema>;
      return listSellerPayouts(request.user!.id, request.channel!.id, { status, page, limit });
    },
  );
}
