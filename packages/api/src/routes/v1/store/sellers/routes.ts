import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { storeSellerResponseSchema } from "./schemas.js";
import { getStoreSellerProfile } from "./service.js";

export async function storeSellerRoutes(app: FastifyInstance) {
  // GET /api/v1/store/sellers/:id — public, returns only safe fields
  app.get("/api/v1/store/sellers/:id", {
    schema: {
      tags: ["Store"],
      summary: "Get a public seller profile by ID or handle",
      params: z.object({ id: z.string().min(1).max(50) }),
      response: { 200: storeSellerResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    return getStoreSellerProfile(id);
  });
}
