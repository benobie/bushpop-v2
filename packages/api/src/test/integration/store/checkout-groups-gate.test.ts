import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../../server.js";

// Verifies the MULTI_VENDOR_CHECKOUT_ENABLED gate around the /checkout-groups
// route registration (server.ts). The multi-seller checkout path is shipped OFF
// by default — its Phase-2 legs (order_group webhook handling, expiry sweep,
// reconciliation) don't exist yet, so leaving it mounted is a live, authenticated
// money path with no order/payout record. See server.ts + docs/HANDOFF-ZERO-CONTEXT.md §3.5/§9.
//
// This test builds its OWN fresh server instances rather than the shared
// getTestApp() singleton (helpers/http.ts), because the gate is read at
// registration time and that singleton is cached process-wide.
//
// Invariant under test — route registration, nothing more:
//   - flag unset  → route NOT registered → 404 (Fastify not-found)
//   - flag "true" → route registered     → NOT 404 (the request reaches the
//                                           lifecycle and is rejected before the
//                                           handler: 400 body-validation, since
//                                           Fastify validates the body before the
//                                           requireAuth preHandler runs)
// The exact non-404 status is not load-bearing; "does the route exist" is.

const FLAG = "MULTI_VENDOR_CHECKOUT_ENABLED";
const ENDPOINT = "/api/v1/store/checkout-groups";

async function buildWithFlag(value: string | undefined): Promise<FastifyInstance> {
  const original = process.env[FLAG];
  if (value === undefined) {
    delete process.env[FLAG];
  } else {
    process.env[FLAG] = value;
  }
  try {
    // The flag is only read during buildServer() (route registration), so it's
    // safe to restore process.env immediately after the build resolves.
    const app = await buildServer();
    await app.ready();
    return app;
  } finally {
    if (original === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = original;
    }
  }
}

async function postCheckoutGroups(app: FastifyInstance) {
  return app.inject({
    method: "POST",
    url: ENDPOINT,
    headers: { "x-channel": "bushpop", "content-type": "application/json" },
    payload: {},
  });
}

// The OpenAPI spec is built from registered routes only, so the endpoint's
// presence in `app.swagger().paths` is a direct proxy for registration —
// locking the "absent from /docs when gated off" half of the contract.
function swaggerHasEndpoint(app: FastifyInstance): boolean {
  return ENDPOINT in (app.swagger().paths ?? {});
}

describe("checkout-groups registration gate", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("returns 404 and hides the route from Swagger when the flag is unset (default OFF)", async () => {
    app = await buildWithFlag(undefined);
    const res = await postCheckoutGroups(app);
    expect(res.statusCode).toBe(404);
    expect(swaggerHasEndpoint(app)).toBe(false);
  });

  it("returns 404 and hides the route from Swagger for any value other than 'true'", async () => {
    app = await buildWithFlag("false");
    const res = await postCheckoutGroups(app);
    expect(res.statusCode).toBe(404);
    expect(swaggerHasEndpoint(app)).toBe(false);
  });

  it("registers the route (400 validation, present in Swagger) when the flag is exactly 'true'", async () => {
    app = await buildWithFlag("true");
    const res = await postCheckoutGroups(app);
    // Route is mounted, so the empty body reaches Zod validation (which runs
    // before the requireAuth preHandler) → 400 VALIDATION_ERROR. Asserting the
    // concrete 400 (not merely "!= 404") guards against a future regression that
    // mounts the route but 500s before validation.
    expect(res.statusCode).toBe(400);
    expect(swaggerHasEndpoint(app)).toBe(true);
  });
});
