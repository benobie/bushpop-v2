import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../../../middleware/require-auth.js";
import {
  createSavedSearchBody,
  savedSearchParams,
  savedSearchListQuery,
  savedSearchResponse,
  savedSearchListResponse,
} from "./schemas.js";
import { createSavedSearch, listSavedSearches, deleteSavedSearch } from "./service.js";
import { z } from "zod";

export async function customerSavedSearchRoutes(app: FastifyInstance) {
  // POST /api/v1/customer/saved-searches
  app.post(
    "/api/v1/customer/saved-searches",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["Customer - Saved Searches"],
        summary: "Save a search",
        body: createSavedSearchBody,
        response: { 201: savedSearchResponse },
      },
    },
    async (request, reply) => {
      const body = request.body as z.infer<typeof createSavedSearchBody>;
      const saved = await createSavedSearch(
        request.user!.id,
        body.channelId,
        body.query,
        body.filters,
        body.name,
      );
      return reply.status(201).send(saved);
    },
  );

  // GET /api/v1/customer/saved-searches
  app.get(
    "/api/v1/customer/saved-searches",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["Customer - Saved Searches"],
        summary: "List saved searches",
        querystring: savedSearchListQuery,
        response: { 200: savedSearchListResponse },
      },
    },
    async (request) => {
      const { channelId } = request.query as z.infer<typeof savedSearchListQuery>;
      const items = await listSavedSearches(request.user!.id, channelId);
      return { items };
    },
  );

  // DELETE /api/v1/customer/saved-searches/:id
  app.delete(
    "/api/v1/customer/saved-searches/:id",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["Customer - Saved Searches"],
        summary: "Delete a saved search",
        params: savedSearchParams,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof savedSearchParams>;
      await deleteSavedSearch(request.user!.id, id);
      return reply.status(204).send();
    },
  );
}
