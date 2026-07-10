import { describe, expect, it } from "vitest";
import { validateEnv } from "@bushpop/config/env";

// Minimal valid env fixture — every non-optional field in envSchema, dummy
// values only. validateEnv() takes an explicit record, so this never touches
// real process.env.
const REQUIRED_BASE_ENV = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  MEILISEARCH_HOST: "http://localhost:7700",
  MEILI_MASTER_KEY: "test-meili-key",
  BETTER_AUTH_SECRET: "a".repeat(32),
  WEB_URL: "http://localhost:3000",
  ADMIN_URL: "http://localhost:3001",
  API_URL: "http://localhost:3333",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
  STARSHIPIT_API_KEY: "starshipit_placeholder",
  STARSHIPIT_WEBHOOK_SECRET: "starshipit_webhook_placeholder",
};

describe("validateEnv — GUEST_ORDER_TOKEN_SECRET production requirement (money-path audit L2)", () => {
  it("throws at boot when NODE_ENV=production and the secret is unset", () => {
    expect(() => validateEnv({ ...REQUIRED_BASE_ENV, NODE_ENV: "production" })).toThrow(
      /GUEST_ORDER_TOKEN_SECRET/,
    );
  });

  it("passes when NODE_ENV=production and the secret is set (>=16 chars)", () => {
    expect(() =>
      validateEnv({
        ...REQUIRED_BASE_ENV,
        NODE_ENV: "production",
        GUEST_ORDER_TOKEN_SECRET: "a".repeat(16),
        PICKUP_CODE_SECRET: "b".repeat(32),
      }),
    ).not.toThrow();
  });

  it("passes in development with the secret unset (dev-fallback path unaffected)", () => {
    expect(() => validateEnv({ ...REQUIRED_BASE_ENV, NODE_ENV: "development" })).not.toThrow();
  });
});

describe("validateEnv — PICKUP_CODE_SECRET production requirement", () => {
  // Regression guard: this var reached the deployed staging engine unset and
  // the container booted healthy, because the only check was the lazy throw in
  // pickup-code-service.ts (fires on the first pickup-code request). 10/07/2026.
  const PROD_BASE = {
    ...REQUIRED_BASE_ENV,
    NODE_ENV: "production",
    GUEST_ORDER_TOKEN_SECRET: "a".repeat(16),
  };

  it("throws at boot when NODE_ENV=production and the secret is unset", () => {
    expect(() => validateEnv(PROD_BASE)).toThrow(/PICKUP_CODE_SECRET/);
  });

  it("throws when the secret is the empty string (what compose injects for an unset ${VAR})", () => {
    expect(() => validateEnv({ ...PROD_BASE, PICKUP_CODE_SECRET: "" })).toThrow(
      /PICKUP_CODE_SECRET/,
    );
  });

  it("throws when the secret is shorter than the 32-char HMAC-key floor", () => {
    expect(() => validateEnv({ ...PROD_BASE, PICKUP_CODE_SECRET: "abc" })).toThrow(
      /PICKUP_CODE_SECRET/,
    );
  });

  it("passes when NODE_ENV=production and the secret is set (>=32 chars)", () => {
    expect(() =>
      validateEnv({ ...PROD_BASE, PICKUP_CODE_SECRET: "b".repeat(64) }),
    ).not.toThrow();
  });

  it("passes in development with the secret unset (dev-fallback path unaffected)", () => {
    expect(() =>
      validateEnv({ ...REQUIRED_BASE_ENV, NODE_ENV: "development" }),
    ).not.toThrow();
  });
});
