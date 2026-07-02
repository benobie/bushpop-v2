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
import { storeListingReportRoutes } from "./routes/v1/store/listing-reports";
import { adminUserRoutes } from "./routes/v1/admin/users";
import { sellerInventoryRoutes } from "./routes/v1/seller/inventory/routes";
import { sellerImageRoutes } from "./routes/v1/seller/images/routes";
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
import { AppError } from "./lib/errors";
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

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
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
  await app.register(sellerListingRoutes);
  await app.register(storeCategoryRoutes);
  await app.register(storeListingRoutes);
  await app.register(storeSellerRoutes);
  await app.register(storeSearchRoutes);
  await app.register(addressRoutes);
  await app.register(cartRoutes);
  await app.register(checkoutRoutes);
  await app.register(checkoutGroupRoutes);
  await app.register(sellerStripeRoutes);
  await app.register(sellerProfileRoutes);
  await app.register(stripeWebhookRoutes);
  await app.register(starshipitWebhookRoutes);
  await app.register(storeOrderRoutes);
  await app.register(sellerOrderRoutes);
  await app.register(adminOrderRoutes);
  await app.register(adminPayoutRoutes);
  await app.register(adminReportRoutes);
  await app.register(storeListingReportRoutes);

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
