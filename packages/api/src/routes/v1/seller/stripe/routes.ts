import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import {
  stripeStatusResponseSchema,
  stripeOnboardResponseSchema,
} from "./schemas.js";
import {
  getOnboardingLink,
  getSellerStripeStatus,
  refreshAccountStatus,
} from "./service.js";

// Factory, not a shared array: @fastify/rate-limit pushes its handler onto the
// preHandler array it is handed, for every route. Two routes sharing one array
// reference would silently share a single limiter bucket.
const sellerPreHandlers = () => [requireAuth, requireRole("seller")];

export async function sellerStripeRoutes(app: FastifyInstance) {
  // POST /api/v1/seller/stripe/onboard
  // Creates a Stripe Connect account (idempotent) and returns an onboarding URL.
  app.post("/api/v1/seller/stripe/onboard", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Stripe"],
      summary: "Start Stripe Connect onboarding",
      response: { 200: stripeOnboardResponseSchema },
    },
  }, async (request) => {
    const baseUrl = process.env.WEB_URL || "http://localhost:3000";
    const returnUrl = `${baseUrl}/seller/onboarding/return`;
    const refreshUrl = `${baseUrl}/seller/onboarding/refresh`;
    return getOnboardingLink(request.user!.id, returnUrl, refreshUrl);
  });

  // GET /api/v1/seller/stripe/status
  // Returns the current Stripe onboarding status from the DB (no Stripe API call).
  app.get("/api/v1/seller/stripe/status", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Stripe"],
      summary: "Get Stripe onboarding status",
      response: { 200: stripeStatusResponseSchema },
    },
  }, async (request) => {
    return getSellerStripeStatus(request.user!.id);
  });

  // GET /api/v1/seller/stripe/refresh
  // Calls Stripe API synchronously and updates seller_profiles.
  // Used on the Connect return URL to handle the webhook race condition.
  app.get("/api/v1/seller/stripe/refresh", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Stripe"],
      summary: "Refresh Stripe status from live Stripe API",
      response: { 200: stripeStatusResponseSchema },
    },
  }, async (request) => {
    return refreshAccountStatus(request.user!.id);
  });
}
