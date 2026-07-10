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
  CHANNEL_SLUG: z.string().min(1).default("bushpop"),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET_NAME: z.string().min(1).optional(),
  R2_PUBLIC_URL: z.string().url().optional(),

  // AI Enrichment / draft generation
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // Gemini is the default AI-draft provider (D12); Anthropic is the
  // escalation path. Either key alone enables the ai-draft worker.
  GEMINI_API_KEY: z.string().min(1).optional(),

  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  // Destination for operator-critical alerts (stuck ops, payout/migration
  // failures). Optional — admin-alerts.ts / email.ts fall back to
  // admin@bushpop.com.au. Set in prod so alerts reach a real inbox without a
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

  // Pickup collection codes (docs/BRIEF-shipping-performance.md §4). HMAC key
  // used to derive a buyer's 6-digit code deterministically from orderId, so
  // no plaintext code is ever stored. Optional so existing deployed envs keep
  // booting — pickup-code-service.ts falls back to a fixed dev-only secret
  // outside production and throws if genuinely missing in production.
  //
  // min(32), not min(16): this is an HMAC-SHA256 key. Sixteen *random* bytes
  // would be fine, but nothing here enforces randomness and sixteen characters
  // of human-chosen text can be well under 128 bits of entropy. Generate with
  // `openssl rand -hex 32`.
  //
  // Rotation blast radius: codes are derived on read and never stored, so
  // changing this value instantly invalidates the code for EVERY outstanding
  // pickup order at once. Correct after a leak; surprising otherwise.
  PICKUP_CODE_SECRET: z.string().min(32).optional(),

  // Guest commerce (BF-08, bushpop-v2 PR #106). HMAC key used to derive a
  // guest buyer's order-access token deterministically from (orderId,
  // buyerId) — same "no plaintext/stored token" shape as PICKUP_CODE_SECRET.
  // Optional so existing deployed envs keep booting — guest-order-access.ts
  // falls back to a fixed dev-only secret outside production and throws if
  // genuinely missing in production.
  GUEST_ORDER_TOKEN_SECRET: z.string().min(16).optional(),
}).superRefine((data, ctx) => {
  // Fail fast at boot rather than lazily at the first guest-order email send
  // (money-path audit L2, 08/07/2026). Scoped to GUEST_ORDER_TOKEN_SECRET
  // only — PICKUP_CODE_SECRET has the same lazy-check shape today but is a
  // separate, out-of-scope finding.
  if (data.NODE_ENV === "production" && !data.GUEST_ORDER_TOKEN_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GUEST_ORDER_TOKEN_SECRET"],
      message: "GUEST_ORDER_TOKEN_SECRET is required in production (min 16 chars).",
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): Env {
  // Compose `${VAR:-}` defaults inject "" for unset vars; treat empty as
  // absent so `.optional()` keys stay optional in containers. Required keys
  // still fail (as "Required" instead of a min-length/url error).
  const normalized = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== ""),
  );
  const result = envSchema.safeParse(normalized);
  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    const message = Object.entries(formatted)
      .map(([key, errors]) => `  ${key}: ${errors?.join(", ")}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${message}`);
  }
  return result.data;
}
