import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../../../middleware/require-auth.js";
import {
  createSavedSearchBody,
  savedSearchParams,
  savedSearchListQuery,
  savedSearchResponse,
  savedSearchListResponse,
  updateSavedSearchBody,
} from "./schemas.js";
import {
  createSavedSearch,
  listSavedSearches,
  deleteSavedSearch,
  renameSavedSearch,
} from "./service.js";
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
        body.channelId ?? request.channel.id,
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
      const items = await listSavedSearches(request.user!.id, channelId ?? request.channel.id);
      return { items };
    },
  );

  // PATCH /api/v1/customer/saved-searches/:id
  app.patch(
    "/api/v1/customer/saved-searches/:id",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["Customer - Saved Searches"],
        summary: "Rename (or clear the label of) a saved search",
        params: savedSearchParams,
        body: updateSavedSearchBody,
        response: { 200: savedSearchResponse },
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof savedSearchParams>;
      const { name } = request.body as z.infer<typeof updateSavedSearchBody>;
      const updated = await renameSavedSearch(request.user!.id, id, name);
      return reply.status(200).send(updated);
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
