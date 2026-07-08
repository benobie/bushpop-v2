import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import {
  addToWishlistBodySchema,
  wishlistParamsSchema,
  wishlistQuerySchema,
  wishlistMutationResponseSchema,
  wishlistListResponseSchema,
  wishlistStatusResponseSchema,
  wishlistBatchCheckBodySchema,
  wishlistBatchCheckResponseSchema,
} from "./schemas.js";
import {
  addToWishlist,
  removeFromWishlist,
  listWishlist,
  getWishlistEntry,
  getFavoritedListingIds,
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

  // GET /api/v1/customer/wishlist/:listingId
  app.get("/api/v1/customer/wishlist/:listingId", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Customer - Wishlist"],
      summary: "Check whether a listing is wishlisted",
      params: wishlistParamsSchema,
      response: { 200: wishlistStatusResponseSchema },
    },
  }, async (request) => {
    const { listingId } = request.params as { listingId: string };
    const entry = await getWishlistEntry(request.user!.id, listingId);
    return { favorited: !!entry };
  });

  // POST /api/v1/customer/wishlist/batch-check
  app.post("/api/v1/customer/wishlist/batch-check", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Customer - Wishlist"],
      summary: "Check which of the given listings are wishlisted by the caller",
      body: wishlistBatchCheckBodySchema,
      response: { 200: wishlistBatchCheckResponseSchema },
    },
  }, async (request) => {
    const { listingIds } = request.body as { listingIds: string[] };
    const favoritedIds = await getFavoritedListingIds(request.user!.id, listingIds);
    return { favoritedIds };
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
