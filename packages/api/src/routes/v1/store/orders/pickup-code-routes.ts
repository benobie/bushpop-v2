import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { issuePickupCodeForBuyer } from "../../../../lib/pickup-code-service.js";

// Deliberately a separate route module from ./routes.ts, ./schemas.ts and
// ./service.ts (docs/BRIEF-shipping-performance.md §4 slice, batch 43D) — PR
// #79 owns those three files (buyer order-read enrichment); this module never
// imports from or edits them, so it can land independently either side of
// that PR merging. Registered on its own in server.ts.

const pickupCodeResponseSchema = z.object({
  orderId: z.string(),
  code: z.string().length(6),
  issuedAt: z.string().datetime(),
});

export async function storePickupCodeRoutes(app: FastifyInstance) {
  // GET /api/v1/store/orders/:id/pickup-code — buyer's collection code
  app.get(
    "/api/v1/store/orders/:id/pickup-code",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["Store - Orders"],
        summary: "Get the buyer's pickup collection code for a pickup order",
        params: z.object({ id: z.string().length(26) }),
        response: { 200: pickupCodeResponseSchema },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      return issuePickupCodeForBuyer(id, request.user!.id);
    },
  );
}
