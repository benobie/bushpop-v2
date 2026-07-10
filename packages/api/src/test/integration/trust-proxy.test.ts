import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../server.js";

// `trustProxy` is read once, in the Fastify constructor, so each case builds
// its own server rather than reusing the shared getTestApp() singleton
// (helpers/http.ts). A probe route echoes the resolved client IP.
//
// Fastify's inject() presents 127.0.0.1 as the socket address, standing in for
// the proxy hop that Caddy occupies in staging/production.

async function buildWithTrustProxy(value: string | undefined): Promise<FastifyInstance> {
  const original = process.env.TRUST_PROXY;
  if (value === undefined) {
    delete process.env.TRUST_PROXY;
  } else {
    process.env.TRUST_PROXY = value;
  }
  try {
    const app = await buildServer();
    app.get("/__test/ip", async (request) => ({ ip: request.ip }));
    await app.ready();
    return app;
  } finally {
    if (original === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = original;
    }
  }
}

async function probeIp(app: FastifyInstance, forwardedFor?: string): Promise<string> {
  const res = await app.inject({
    method: "GET",
    url: "/__test/ip",
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
  });
  expect(res.statusCode).toBe(200);
  return res.json().ip;
}

describe("trustProxy client-IP resolution", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("ignores X-Forwarded-For when TRUST_PROXY is unset", async () => {
    app = await buildWithTrustProxy(undefined);
    expect(await probeIp(app, "203.0.113.7")).toBe("127.0.0.1");
  });

  it("resolves the client IP from X-Forwarded-For when TRUST_PROXY=1", async () => {
    app = await buildWithTrustProxy("1");
    expect(await probeIp(app, "203.0.113.7")).toBe("203.0.113.7");
  });

  it("ignores spoofed left-most entries at a one-hop trust setting", async () => {
    app = await buildWithTrustProxy("1");
    // A client that sets its own X-Forwarded-For gets its value *appended to*
    // by the proxy, so the real address is the right-most entry.
    expect(await probeIp(app, "9.9.9.9, 203.0.113.7")).toBe("203.0.113.7");
  });

  it("falls back to the socket address when no X-Forwarded-For is present", async () => {
    app = await buildWithTrustProxy("1");
    expect(await probeIp(app)).toBe("127.0.0.1");
  });

  it("refuses to build with TRUST_PROXY=true", async () => {
    await expect(buildWithTrustProxy("true")).rejects.toThrow(/not allowed/);
  });
});
