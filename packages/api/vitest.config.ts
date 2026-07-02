import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
    // Test env vars are defined here (not in package.json scripts) so that
    // gitleaks doesn't flag the BETTER_AUTH_SECRET placeholder. These are
    // local-dev / CI placeholder values only — never real secrets.
    env: {
      DATABASE_URL: "postgres://bushpop:bushpop_dev@localhost:5435/bushpop_test",
      REDIS_URL: "redis://localhost:6380",
      MEILISEARCH_HOST: "http://localhost:7701",
      MEILI_MASTER_KEY: "dev_master_key_change_in_production",
      BETTER_AUTH_SECRET: "testsecret12345678901234567890ab",
      WEB_URL: "http://localhost:3000",
      ADMIN_URL: "http://localhost:3001",
      API_URL: "http://localhost:3333",
    },
  },
});
