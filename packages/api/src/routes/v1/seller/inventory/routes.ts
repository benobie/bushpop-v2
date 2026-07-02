import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  archiveInventoryItemSchema,
  transitionLifecycleSchema,
  listInventoryQuerySchema,
  inventoryItemResponseSchema,
  cursorResponseSchema,
} from "./schemas.js";
import {
  createInventoryItem,
  listInventoryItems,
  getInventoryItem,
  updateInventoryItem,
  transitionLifecycle,
  archiveInventoryItem,
} from "./service.js";
import { z } from "zod";
import type { LifecycleState } from "../../../../lib/inventory-machines.js";

const sellerPreHandlers = [requireAuth, requireRole("seller")];

export async function sellerInventoryRoutes(app: FastifyInstance) {
  // POST /api/v1/seller/inventory
  app.post("/api/v1/seller/inventory", {
    preHandler: sellerPreHandlers,
    schema: {
      tags: ["Seller - Inventory"],
      summary: "Create an inventory item",
      body: createInventoryItemSchema,
      response: { 201: inventoryItemResponseSchema },
    },
  }, async (request, reply) => {
    const item = await createInventoryItem(
      request.user!.id,
      request.body as z.infer<typeof createInventoryItemSchema>,
    );
    return reply.status(201).send(item);
  });

  // GET /api/v1/seller/inventory
  app.get("/api/v1/seller/inventory", {
    preHandler: sellerPreHandlers,
    schema: {
      tags: ["Seller - Inventory"],
      summary: "List own inventory items",
      querystring: listInventoryQuerySchema,
      response: { 200: cursorResponseSchema(inventoryItemResponseSchema) },
    },
  }, async (request) => {
    const query = request.query as z.infer<typeof listInventoryQuerySchema>;
    return listInventoryItems(request.user!.id, query);
  });

  // GET /api/v1/seller/inventory/:id
  app.get("/api/v1/seller/inventory/:id", {
    preHandler: sellerPreHandlers,
    schema: {
      tags: ["Seller - Inventory"],
      summary: "Get inventory item with images",
      params: z.object({ id: z.string().length(26) }),
      response: { 200: inventoryItemResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    return getInventoryItem(id, request.user!.id);
  });

  // PATCH /api/v1/seller/inventory/:id
  app.patch("/api/v1/seller/inventory/:id", {
    preHandler: sellerPreHandlers,
    schema: {
      tags: ["Seller - Inventory"],
      summary: "Update inventory item attributes",
      params: z.object({ id: z.string().length(26) }),
      body: updateInventoryItemSchema,
      response: { 200: inventoryItemResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as z.infer<typeof updateInventoryItemSchema>;
    return updateInventoryItem(id, request.user!.id, body);
  });

  // PATCH /api/v1/seller/inventory/:id/lifecycle
  app.patch("/api/v1/seller/inventory/:id/lifecycle", {
    preHandler: sellerPreHandlers,
    schema: {
      tags: ["Seller - Inventory"],
      summary: "Transition inventory item lifecycle state",
      params: z.object({ id: z.string().length(26) }),
      body: transitionLifecycleSchema,
      response: {
        200: z.object({
          id: z.string(),
          lifecycleState: z.string(),
          version: z.number(),
        }),
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { to, version } = request.body as z.infer<typeof transitionLifecycleSchema>;
    return transitionLifecycle(id, request.user!.id, to as LifecycleState, version);
  });

  // PATCH /api/v1/seller/inventory/:id/archive
  app.patch("/api/v1/seller/inventory/:id/archive", {
    preHandler: sellerPreHandlers,
    schema: {
      tags: ["Seller - Inventory"],
      summary: "Archive inventory item",
      params: z.object({ id: z.string().length(26) }),
      body: archiveInventoryItemSchema,
      response: { 204: z.null() },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { version } = request.body as { version: number };
    await archiveInventoryItem(id, request.user!.id, version);
    return reply.status(204).send();
  });
}
