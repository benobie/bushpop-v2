import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  MEILISEARCH_HOST: z.string().url(),
  MEILI_MASTER_KEY: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  WEB_URL: z.string().url(),
  ADMIN_URL: z.string().url(),
  API_URL: z.string().url(),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  CHANNEL_SLUG: z.string().min(1).default("piklo"),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET_NAME: z.string().min(1).optional(),
  R2_PUBLIC_URL: z.string().url().optional(),

  // AI Enrichment
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  // Destination for operator-critical alerts (stuck ops, payout/migration
  // failures). Optional — admin-alerts.ts / email.ts fall back to
  // admin@piklo.com.au. Set in prod so alerts reach a real inbox without a
  // redeploy. See INF-H2.
  ADMIN_EMAIL: z.string().email().optional(),

  // Payments (Stripe)
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  // Shipping (StarShipIt)
  STARSHIPIT_API_KEY: z.string().min(1),
  STARSHIPIT_WEBHOOK_SECRET: z.string().min(1),
  // Ocp-Apim-Subscription-Key for OUTBOUND Starshipit REST calls (address
  // validate / create label / tracking). NOT webhook auth — inbound webhooks
  // are verified by STARSHIPIT_WEBHOOK_SECRET (HMAC-SHA256). Schema-optional,
  // but if the Starshipit account's API gateway enforces it, outbound shipping
  // calls 403 without it → effectively required for the shipping flow. INF-M5.
  STARSHIPIT_SUBSCRIPTION_KEY: z.string().min(1).optional(),

  SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    const message = Object.entries(formatted)
      .map(([key, errors]) => `  ${key}: ${errors?.join(", ")}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${message}`);
  }
  return result.data;
}
