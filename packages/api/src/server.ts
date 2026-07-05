import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { ulid } from "ulid";
import { channelPlugin } from "./plugins/channel";
import { authPlugin } from "./plugins/auth";
import { healthRoutes } from "./routes/health";
import { channelRoutes } from "./routes/v1/store/channels";
import { meRoutes } from "./routes/v1/customer/me";
import { wishlistRoutes } from "./routes/v1/customer/wishlist/routes";
import { customerSavedSearchRoutes } from "./routes/v1/customer/saved-searches/routes";
import { adminReportRoutes } from "./routes/v1/admin/reports/routes";
import { adminModerationRoutes } from "./routes/v1/admin/moderation";
import { storeListingReportRoutes } from "./routes/v1/store/listing-reports";
import { adminUserRoutes } from "./routes/v1/admin/users";
import { sellerInventoryRoutes } from "./routes/v1/seller/inventory/routes";
import { sellerImageRoutes } from "./routes/v1/seller/images/routes";
import { sellerDraftRoutes } from "./routes/v1/seller/drafts/routes";
import { sellerBulkRoutes } from "./routes/v1/seller/bulk/routes";
import { sellerListingRoutes } from "./routes/v1/seller/listings/routes";
import { storeCategoryRoutes } from "./routes/v1/store/categories";
import { storeListingRoutes } from "./routes/v1/store/listings";
import { storeSellerRoutes } from "./routes/v1/store/sellers/routes";
import { storeSearchRoutes } from "./routes/v1/store/search/routes";
import { addressRoutes } from "./routes/v1/store/addresses/routes";
import { cartRoutes } from "./routes/v1/store/cart/routes";
import { checkoutRoutes } from "./routes/v1/store/checkout/routes";
import { checkoutGroupRoutes } from "./routes/v1/store/checkout-groups/routes";
import { sellerStripeRoutes } from "./routes/v1/seller/stripe/routes";
import { sellerProfileRoutes } from "./routes/v1/seller/profile/routes";
import { stripeWebhookRoutes } from "./routes/v1/webhooks/stripe";
import { starshipitWebhookRoutes } from "./routes/v1/webhooks/starshipit";
import { storeOrderRoutes } from "./routes/v1/store/orders/routes";
import { sellerOrderRoutes } from "./routes/v1/seller/orders/routes";
import { adminOrderRoutes } from "./routes/v1/admin/orders/routes";
import { adminPayoutRoutes } from "./routes/v1/admin/payouts/routes";
import { adminListingRoutes } from "./routes/v1/admin/listings";
import { adminAiUsageRoutes } from "./routes/v1/admin/ai-usage";
import { adminFeeRoutes } from "./routes/v1/admin/fees";
import { adminEmailJobRoutes } from "./routes/v1/admin/email-jobs";
import { AppError, PublishNotReadyError } from "./lib/errors";
import { InvalidTransitionError } from "./lib/state-machine";
import { registerIdempotencyHook } from "./middleware/idempotency";
import { setupListingsIndex, purgeStaleQueueEventsIfNeeded } from "./lib/search-index";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    genReqId: () => ulid(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // CORS
  await app.register(cors, {
    origin: [
      process.env.WEB_URL || "http://localhost:3000",
      process.env.ADMIN_URL || "http://localhost:3001",
    ],
    credentials: true,
  });

  // Cookies
  await app.register(cookie);

  // Rate limiting.
  // hook MUST be 'preHandler' (task 10): the default onRequest runs before
  // requireAuth (a route-level preHandler), so request.user is unset and a
  // user-id keyGenerator silently degrades to IP. @fastify/rate-limit
  // appends its per-route handler AFTER the route's own preHandler array,
  // so at preHandler the authenticated user is available.
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    hook: "preHandler",
    keyGenerator: (req) => req.user?.id ?? req.ip,
  });

  // OpenAPI / Swagger
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Bushpop API",
        version: "0.1.0",
        description: "Bushpop P2P fashion marketplace API",
      },
      servers: [
        {
          url: process.env.API_URL || "http://localhost:3333",
          description: "Local development",
        },
      ],
    },
    // Required for fastify-type-provider-zod — converts Zod schemas to JSON Schema
    // before @fastify/swagger processes them. Without this, raw ZodType objects are
    // passed through and crash on internal null properties.
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
  });

  // Channel resolution
  await app.register(channelPlugin);

  // Auth (Better Auth — handles /api/auth/* routes)
  await app.register(authPlugin);

  // Global error handler
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof PublishNotReadyError) {
      return reply.status(422).send({
        error: error.code,
        message: error.message,
        missing: error.missing,
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code || error.name,
        message: error.message,
      });
    }

    if (error instanceof InvalidTransitionError) {
      return reply.status(422).send({
        error: "INVALID_TRANSITION",
        message: error.message,
      });
    }

    // Fastify/Zod schema validation errors
    const errAsAny = error as { statusCode?: number; validation?: unknown; message?: string };

    // @fastify/rate-limit throws a fastify error with statusCode 429 —
    // without this branch it would fall through to the 500 catch-all.
    if (errAsAny.statusCode === 429) {
      return reply.status(429).send({
        error: "TOO_MANY_REQUESTS",
        message: errAsAny.message ?? "Rate limit exceeded",
      });
    }

    if (errAsAny.statusCode === 400 || errAsAny.validation) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: errAsAny.message ?? "Validation error",
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    });
  });

  // Idempotency response caching hook
  registerIdempotencyHook(app);

  // Routes
  await app.register(healthRoutes);

  // API v1 routes
  await app.register(channelRoutes);
  await app.register(meRoutes);
  await app.register(wishlistRoutes);
  await app.register(customerSavedSearchRoutes);
  await app.register(adminUserRoutes);
  await app.register(sellerInventoryRoutes);
  await app.register(sellerImageRoutes);
  await app.register(sellerDraftRoutes);
  await app.register(sellerBulkRoutes);
  await app.register(sellerListingRoutes);
  await app.register(storeCategoryRoutes);
  await app.register(storeListingRoutes);
  await app.register(storeSellerRoutes);
  await app.register(storeSearchRoutes);
  await app.register(addressRoutes);
  await app.register(cartRoutes);
  await app.register(checkoutRoutes);
  // Multi-seller checkout is GATED OFF by default. The /checkout-groups path can create
  // a real Stripe Connect PaymentIntent, but its Phase-2 legs are unbuilt: the Stripe
  // webhook has no order_group handling, checkout-expiry doesn't sweep order_groups, and
  // reconcile-indeterminate-ops explicitly skips order-group ops (W3+). It also charges
  // $0 Buyer Protection fee (Fee Model D excluded BP to avoid Connect over-withholding).
  // Leaving it mounted = a live, authenticated, Swagger-discoverable money path with no
  // order/payout/reconciliation record. Do NOT un-gate until those legs exist (Phase 2).
  // Mirrors the PAYOUT_RELEASE_ENABLED precedent (workers/index.ts). See §7 debt register
  // + docs/HANDOFF-ZERO-CONTEXT.md §3.5/§9.
  if (process.env.MULTI_VENDOR_CHECKOUT_ENABLED === "true") {
    await app.register(checkoutGroupRoutes);
  }
  await app.register(sellerStripeRoutes);
  await app.register(sellerProfileRoutes);
  await app.register(stripeWebhookRoutes);
  await app.register(starshipitWebhookRoutes);
  await app.register(storeOrderRoutes);
  await app.register(sellerOrderRoutes);
  await app.register(adminOrderRoutes);
  await app.register(adminPayoutRoutes);
  await app.register(adminListingRoutes);
  await app.register(adminAiUsageRoutes);
  await app.register(adminFeeRoutes);
  await app.register(adminEmailJobRoutes);
  await app.register(adminReportRoutes);
  await app.register(storeListingReportRoutes);
  // Moderation queue v1 (B4) ships dark — the admin-flag intake route is new
  // attack surface (an admin can flag any listing directly), even though it's
  // admin-role-gated. Mirrors the MULTI_VENDOR_CHECKOUT_ENABLED precedent above.
  // The existing GET/PATCH /api/v1/admin/reports routes predate this flag
  // (forked in from piklo-v2) and stay always-on — they're read/transition-only
  // and already admin-gated. Track F (multi-vendor) is hard-gated on this queue.
  if (process.env.MODERATION_QUEUE_ENABLED === "true") {
    await app.register(adminModerationRoutes);
  }

  // MeiliSearch bootstrap — runs in Fastify ready() hook, before app.listen()
  // Skipped in test environment (tests manage their own index lifecycle)
  if (process.env.NODE_ENV !== "test") {
    app.addHook("onReady", async () => {
      const channelSlug = process.env.CHANNEL_SLUG ?? "bushpop";
      try {
        const bootstrapped = await purgeStaleQueueEventsIfNeeded(channelSlug);
        if (!bootstrapped) {
          // Already bootstrapped — just ensure index settings are current
          await setupListingsIndex(channelSlug);
        }
      } catch (err) {
        app.log.error(
          { err },
          "[search-index] Bootstrap failed — search will be unavailable",
        );
        // Do not exit — individual listing pages (Postgres) still work
      }
    });
  }

  return app;
}
