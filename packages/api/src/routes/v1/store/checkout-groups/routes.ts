import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { idempotencyMiddleware } from "../../../../middleware/idempotency.js";
import {
  createCheckoutGroupBody,
  checkoutGroupIdParam,
  checkoutGroupQuoteResponseSchema,
  checkoutGroupStatusResponseSchema,
  cancelCheckoutGroupResponseSchema,
} from "./schemas.js";
import {
  createQuoteAndPaymentIntent,
  getCheckoutGroup,
  cancelCheckoutGroup,
} from "./service.js";

export async function checkoutGroupRoutes(app: FastifyInstance) {
  // POST /api/v1/store/checkout-groups — create quote + Stripe PaymentIntent
  // Rate-limit allowList bypasses tests: @fastify/rate-limit runs as onRequest
  // (before preHandler auth), so req.user is undefined when keyGenerator fires
  // and integration tests all fall back to req.ip = 127.0.0.1, exhausting the
  // bucket of 5 across the suite.
  app.post("/api/v1/store/checkout-groups", {
    preHandler: [requireAuth, idempotencyMiddleware],
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "1 minute",
        keyGenerator: (req: { user?: { id: string } | null; ip: string }) =>
          req.user?.id ?? req.ip,
        allowList: () => process.env.NODE_ENV === "test",
      },
    },
    schema: {
      tags: ["Checkout Groups"],
      summary:
        "Create a multi-vendor checkout group — reserve inventory + create Stripe PaymentIntent",
      body: createCheckoutGroupBody,
      response: { 200: checkoutGroupQuoteResponseSchema },
    },
  }, async (request, reply) => {
    const { shippingAddressId } = request.body as { shippingAddressId: string };
    const buyerId = request.user!.id;
    const channelId = request.channel!.id;

    const result = await createQuoteAndPaymentIntent(buyerId, channelId, shippingAddressId);
    return reply.status(200).send(result);
  });

  // GET /api/v1/store/checkout-groups/:id — get order group status (buyer polling)
  app.get("/api/v1/store/checkout-groups/:id", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Checkout Groups"],
      summary: "Get a checkout group by ID (buyer only)",
      params: checkoutGroupIdParam,
      response: { 200: checkoutGroupStatusResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const buyerId = request.user!.id;

    const group = await getCheckoutGroup(id, buyerId);
    return reply.status(200).send(group);
  });

  // POST /api/v1/store/checkout-groups/:id/cancel — cancel pre-payment
  // Rate-limit allowList bypasses tests for the same reason as the create
  // endpoint above.
  app.post("/api/v1/store/checkout-groups/:id/cancel", {
    preHandler: [requireAuth, idempotencyMiddleware],
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "1 minute",
        keyGenerator: (req: { user?: { id: string } | null; ip: string }) =>
          req.user?.id ?? req.ip,
        allowList: () => process.env.NODE_ENV === "test",
      },
    },
    schema: {
      tags: ["Checkout Groups"],
      summary: "Cancel a checkout group (created or payment_pending only)",
      params: checkoutGroupIdParam,
      response: { 200: cancelCheckoutGroupResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const buyerId = request.user!.id;

    await cancelCheckoutGroup(id, buyerId);
    return reply.status(200).send({ cancelled: true });
  });
}
