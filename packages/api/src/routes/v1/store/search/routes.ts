import type { FastifyInstance } from "fastify";
import {
  browseQuerySchema,
  searchQuerySchema,
  listingPageResponseSchema,
} from "./schemas.js";
import { browseListings, searchListings } from "./service.js";

export async function storeSearchRoutes(app: FastifyInstance) {
  // GET /api/v1/store/listings — browse (no text query, filters + sort)
  app.get("/api/v1/store/listings", {
    schema: {
      tags: ["Store"],
      summary: "Browse listings (filter + sort, no text query)",
      querystring: browseQuerySchema,
      response: { 200: listingPageResponseSchema },
    },
  }, async (request) => {
    return browseListings(request.query as Parameters<typeof browseListings>[0], request.channel!.slug);
  });

  // GET /api/v1/store/search — full-text search (required q param + filters)
  app.get("/api/v1/store/search", {
    schema: {
      tags: ["Store"],
      summary: "Search listings (full-text + filter + sort)",
      querystring: searchQuerySchema,
      response: { 200: listingPageResponseSchema },
    },
  }, async (request) => {
    return searchListings(request.query as Parameters<typeof searchListings>[0], request.channel!.slug);
  });
}
