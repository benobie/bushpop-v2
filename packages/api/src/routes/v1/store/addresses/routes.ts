import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import {
  createAddressSchema,
  updateAddressSchema,
  addressResponseSchema,
} from "./schemas.js";
import {
  createAddress,
  listAddresses,
  getAddress,
  updateAddress,
  deleteAddress,
} from "./service.js";

export async function addressRoutes(app: FastifyInstance) {
  // POST /api/v1/addresses
  app.post("/api/v1/addresses", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Addresses"],
      summary: "Create an address",
      body: createAddressSchema,
      response: { 201: addressResponseSchema },
    },
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof createAddressSchema>;
    const address = await createAddress(request.user!.id, body);
    return reply.status(201).send(address);
  });

  // GET /api/v1/addresses
  app.get("/api/v1/addresses", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Addresses"],
      summary: "List own addresses (excludes soft-deleted)",
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      response: { 200: z.array(addressResponseSchema) },
    },
  }, async (request) => {
    const { limit } = request.query as { limit: number };
    return listAddresses(request.user!.id, limit);
  });

  // GET /api/v1/addresses/:id
  app.get("/api/v1/addresses/:id", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Addresses"],
      summary: "Get address by ID — must belong to caller",
      params: z.object({ id: z.string().length(26) }),
      response: { 200: addressResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    return getAddress(id, request.user!.id);
  });

  // PATCH /api/v1/addresses/:id
  app.patch("/api/v1/addresses/:id", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Addresses"],
      summary: "Update an address",
      params: z.object({ id: z.string().length(26) }),
      body: updateAddressSchema,
      response: { 200: addressResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as z.infer<typeof updateAddressSchema>;
    return updateAddress(id, request.user!.id, body);
  });

  // DELETE /api/v1/addresses/:id — soft delete
  app.delete("/api/v1/addresses/:id", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Addresses"],
      summary: "Soft-delete an address",
      params: z.object({ id: z.string().length(26) }),
      response: { 204: z.null() },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await deleteAddress(id, request.user!.id);
    return reply.status(204).send();
  });
}
