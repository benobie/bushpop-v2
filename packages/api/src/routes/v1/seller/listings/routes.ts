import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import {
  createListingSchema,
  updateListingSchema,
  archiveListingSchema,
  transitionListingStatusSchema,
  listListingsQuerySchema,
  channelListingResponseSchema,
  cursorListingResponseSchema,
  listingScoreResponseSchema,
} from "./schemas.js";
import {
  createListing,
  listListings,
  getListing,
  updateListing,
  transitionListingStatus,
  archiveListing,
  getListingScore,
} from "./service.js";
import type { ListingStatus } from "../../../../lib/inventory-machines.js";

// Factory, not a shared array: @fastify/rate-limit pushes its handler onto the
// preHandler array it is handed, for every route. Two routes sharing one array
// reference would silently share a single limiter bucket.
const sellerPreHandlers = () => [requireAuth, requireRole("seller")];

export async function sellerListingRoutes(app: FastifyInstance) {
  // POST /api/v1/seller/listings
  app.post("/api/v1/seller/listings", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Listings"],
      summary: "Create a draft listing",
      body: createListingSchema,
      response: { 201: channelListingResponseSchema },
    },
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof createListingSchema>;
    const listing = await createListing(request.user!.id, body);
    return reply.status(201).send(listing);
  });

  // GET /api/v1/seller/listings
  app.get("/api/v1/seller/listings", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Listings"],
      summary: "List own listings",
      querystring: listListingsQuerySchema,
      response: { 200: cursorListingResponseSchema },
    },
  }, async (request) => {
    const query = request.query as z.infer<typeof listListingsQuerySchema>;
    return listListings(request.user!.id, query);
  });

  // GET /api/v1/seller/listings/:id
  app.get("/api/v1/seller/listings/:id", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Listings"],
      summary: "Get a listing",
      params: z.object({ id: z.string().length(26) }),
      response: { 200: channelListingResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    return getListing(id, request.user!.id);
  });

  // PATCH /api/v1/seller/listings/:id
  app.patch("/api/v1/seller/listings/:id", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Listings"],
      summary: "Update a listing",
      params: z.object({ id: z.string().length(26) }),
      body: updateListingSchema,
      response: { 200: channelListingResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as z.infer<typeof updateListingSchema>;
    return updateListing(id, request.user!.id, body);
  });

  // PATCH /api/v1/seller/listings/:id/status
  app.patch("/api/v1/seller/listings/:id/status", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Listings"],
      summary: "Transition listing status",
      params: z.object({ id: z.string().length(26) }),
      body: transitionListingStatusSchema,
      response: { 200: channelListingResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { to, version } = request.body as z.infer<typeof transitionListingStatusSchema>;
    return transitionListingStatus(id, request.user!.id, to as ListingStatus, version);
  });

  // GET /api/v1/seller/listings/:id/score
  app.get("/api/v1/seller/listings/:id/score", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Listings"],
      summary: "Get listing quality score and nudge",
      params: z.object({ id: z.string().length(26) }),
      response: { 200: listingScoreResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    return getListingScore(id, request.user!.id);
  });

  // PATCH /api/v1/seller/listings/:id/archive
  app.patch("/api/v1/seller/listings/:id/archive", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Listings"],
      summary: "Archive a listing",
      params: z.object({ id: z.string().length(26) }),
      body: archiveListingSchema,
      response: { 204: z.null() },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { version } = request.body as { version: number };
    await archiveListing(id, request.user!.id, version);
    return reply.status(204).send();
  });
}
