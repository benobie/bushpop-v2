import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../../server.js";

// Verifies the MODERATION_QUEUE_ENABLED gate around the admin manual-flag
// intake route (server.ts). B4's moderation queue ships dark: the existing
// GET/PATCH /api/v1/admin/reports routes predate this flag (forked in from
// piklo-v2) and stay always-on, but the new admin-flag-creation route is new
// attack surface and stays gated off by default. See server.ts comment +
// docs/takedown-process.md.
//
// This test builds its OWN fresh server instances rather than the shared
// getTestApp() singleton (helpers/http.ts), because the gate is read at
// registration time and that singleton is cached process-wide.

const FLAG = "MODERATION_QUEUE_ENABLED";
const ENDPOINT = "/api/v1/admin/moderation/flags";

async function buildWithFlag(value: string | undefined): Promise<FastifyInstance> {
  const original = process.env[FLAG];
  if (value === undefined) {
    delete process.env[FLAG];
  } else {
    process.env[FLAG] = value;
  }
  try {
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

async function postFlag(app: FastifyInstance) {
  return app.inject({
    method: "POST",
    url: ENDPOINT,
    headers: { "x-channel": "bushpop", "content-type": "application/json" },
    payload: {},
  });
}

function swaggerHasEndpoint(app: FastifyInstance): boolean {
  return ENDPOINT in (app.swagger().paths ?? {});
}

describe("admin moderation flag registration gate", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("returns 404 and hides the route from Swagger when the flag is unset (default OFF)", async () => {
    app = await buildWithFlag(undefined);
    const res = await postFlag(app);
    expect(res.statusCode).toBe(404);
    expect(swaggerHasEndpoint(app)).toBe(false);
  });

  it("returns 404 and hides the route from Swagger for any value other than 'true'", async () => {
    app = await buildWithFlag("false");
    const res = await postFlag(app);
    expect(res.statusCode).toBe(404);
    expect(swaggerHasEndpoint(app)).toBe(false);
  });

  it("registers the route (400 validation, present in Swagger) when the flag is exactly 'true'", async () => {
    app = await buildWithFlag("true");
    const res = await postFlag(app);
    expect(res.statusCode).toBe(400);
    expect(swaggerHasEndpoint(app)).toBe(true);
  });
});
