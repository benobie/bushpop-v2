import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { idempotencyMiddleware } from "../../../../middleware/idempotency.js";
import { ValidationError } from "../../../../lib/errors.js";
import {
  initiateCheckoutBody,
  checkoutIdParam,
  checkoutResponseSchema,
  checkoutSessionFullSchema,
  cancelCheckoutResponseSchema,
} from "./schemas.js";
import {
  initiateCheckout,
  setGuestCheckoutEmail,
  getCheckoutSession,
  cancelCheckoutSession,
} from "./service.js";

export async function checkoutRoutes(app: FastifyInstance) {
  // POST /api/v1/store/checkout — initiate checkout from current cart
  // Rate-limit allowList bypasses tests: @fastify/rate-limit runs as onRequest
  // (before preHandler auth), so req.user is undefined when keyGenerator fires
  // and integration tests all fall back to req.ip = 127.0.0.1, exhausting the
  // bucket of 5 across the suite.
  app.post("/api/v1/store/checkout", {
    preHandler: [requireAuth, idempotencyMiddleware],
    config: { rateLimit: { max: 5, timeWindow: "1 minute", keyGenerator: (req: { user?: { id: string } | null; ip: string }) => req.user?.id ?? req.ip, allowList: () => process.env.NODE_ENV === "test" } },
    schema: {
      tags: ["Checkout"],
      summary: "Initiate checkout — reserve inventory + create Stripe PaymentIntent",
      body: initiateCheckoutBody,
      response: { 200: checkoutResponseSchema },
    },
  }, async (request, reply) => {
    const { shippingAddressId, buyerEmail } = request.body as {
      shippingAddressId: string;
      buyerEmail?: string;
    };
    const buyerId = request.user!.id;
    const channelId = request.channel!.id;

    // BF-08 guest commerce — an anonymous session has a placeholder email;
    // require + apply the real one before reserving inventory or touching
    // Stripe. Never runs for a real account, even if buyerEmail is sent.
    if (request.user!.isAnonymous) {
      if (!buyerEmail) {
        throw new ValidationError("Enter your email to check out as a guest.");
      }
      await setGuestCheckoutEmail(buyerId, buyerEmail);
    }

    const result = await initiateCheckout(buyerId, channelId, shippingAddressId);
    return reply.status(200).send(result);
  });

  // GET /api/v1/store/checkout/:id — get session (buyer polling / recovery)
  app.get("/api/v1/store/checkout/:id", {
    preHandler: [requireAuth],
    schema: {
      tags: ["Checkout"],
      summary: "Get a checkout session by ID (buyer only)",
      params: checkoutIdParam,
      response: { 200: checkoutSessionFullSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const buyerId = request.user!.id;

    const session = await getCheckoutSession(id, buyerId);
    return reply.status(200).send(session);
  });

  // POST /api/v1/store/checkout/:id/cancel — cancel from created or payment_pending
  // Rate-limit allowList bypasses tests for the same reason as the initiate
  // endpoint above (rate-limit runs before auth, all tests share 127.0.0.1).
  app.post("/api/v1/store/checkout/:id/cancel", {
    preHandler: [requireAuth, idempotencyMiddleware],
    config: { rateLimit: { max: 10, timeWindow: "1 minute", keyGenerator: (req: { user?: { id: string } | null; ip: string }) => req.user?.id ?? req.ip, allowList: () => process.env.NODE_ENV === "test" } },
    schema: {
      tags: ["Checkout"],
      summary: "Cancel a checkout session (created or payment_pending only)",
      params: checkoutIdParam,
      response: { 200: cancelCheckoutResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const buyerId = request.user!.id;

    await cancelCheckoutSession(id, buyerId);
    return reply.status(200).send({ cancelled: true });
  });
}
