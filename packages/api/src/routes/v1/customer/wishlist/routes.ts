import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import {
  addToWishlistBodySchema,
  wishlistParamsSchema,
  wishlistQuerySchema,
  wishlistMutationResponseSchema,
  wishlistListResponseSchema,
} from "./schemas.js";
import {
  addToWishlist,
  removeFromWishlist,
  listWishlist,
} from "./service.js";

export async function wishlistRoutes(app: FastifyInstance) {
  // POST /api/v1/customer/wishlist
  app.post("/api/v1/customer/wishlist", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Customer - Wishlist"],
      summary: "Add a listing to wishlist",
      body: addToWishlistBodySchema,
      response: {
        200: wishlistMutationResponseSchema,
      },
    },
  }, async (request, reply) => {
    const { listingId } = request.body as { listingId: string };
    const result = await addToWishlist(request.user!.id, listingId, request.channel.id);
    return reply.status(200).send({
      id: result.id,
      listingId: result.channelListingId,
      addedAt: result.createdAt.toISOString(),
    });
  });

  // DELETE /api/v1/customer/wishlist/:listingId
  app.delete("/api/v1/customer/wishlist/:listingId", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Customer - Wishlist"],
      summary: "Remove a listing from wishlist",
      params: wishlistParamsSchema,
      response: { 204: z.null() },
    },
  }, async (request, reply) => {
    const { listingId } = request.params as { listingId: string };
    await removeFromWishlist(request.user!.id, listingId);
    return reply.status(204).send();
  });

  // GET /api/v1/customer/wishlist
  app.get("/api/v1/customer/wishlist", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Customer - Wishlist"],
      summary: "List wishlisted items",
      querystring: wishlistQuerySchema,
      response: { 200: wishlistListResponseSchema },
    },
  }, async (request) => {
    const { cursor, limit } = request.query as { cursor?: string; limit: number };
    return listWishlist(request.user!.id, request.channel.id, cursor, limit);
  });
}
