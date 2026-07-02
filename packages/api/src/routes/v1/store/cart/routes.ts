import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { addToCartSchema, cartSchema } from "./schemas.js";
import { addToCart, getCart, removeCartItem, clearCart } from "./service.js";

export async function cartRoutes(app: FastifyInstance) {
  // POST /api/v1/store/cart/items — add a listing to cart
  // ADR-015 Sprint 1b W1: cart is multi-seller; SELLER_MISMATCH removed.
  app.post("/api/v1/store/cart/items", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Cart"],
      summary: "Add a listing to the buyer's cart",
      body: addToCartSchema,
      response: { 200: cartSchema },
    },
  }, async (request, reply) => {
    const { listingId } = request.body as z.infer<typeof addToCartSchema>;
    const buyerId = request.user!.id;
    const channelId = request.channel!.id;

    const cart = await addToCart(buyerId, channelId, listingId);
    return reply.status(200).send(cart);
  });

  // GET /api/v1/store/cart — get the buyer's current cart
  app.get("/api/v1/store/cart", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Cart"],
      summary: "Get the buyer's current cart (null if empty)",
      response: { 200: cartSchema.nullable() },
    },
  }, async (request) => {
    const buyerId = request.user!.id;
    const channelId = request.channel!.id;
    return getCart(buyerId, channelId);
  });

  // DELETE /api/v1/store/cart/items/:id — remove a single cart item
  app.delete("/api/v1/store/cart/items/:id", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Cart"],
      summary: "Remove an item from the buyer's cart",
      params: z.object({ id: z.string().length(26) }),
      response: { 204: z.null() },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const buyerId = request.user!.id;
    const channelId = request.channel!.id;

    await removeCartItem(buyerId, channelId, id);
    return reply.status(204).send();
  });

  // DELETE /api/v1/store/cart — clear the entire cart
  app.delete("/api/v1/store/cart", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Cart"],
      summary: "Clear the buyer's cart (idempotent)",
      response: { 204: z.null() },
    },
  }, async (request, reply) => {
    const buyerId = request.user!.id;
    const channelId = request.channel!.id;

    await clearCart(buyerId, channelId);
    return reply.status(204).send();
  });
}
