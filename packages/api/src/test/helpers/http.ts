import { buildServer } from "../../server.js";
import type { FastifyInstance, InjectOptions } from "fastify";

let app: FastifyInstance | null = null;

export async function getTestApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildServer();
    await app.ready();
  }
  return app;
}

/**
 * Make an authenticated HTTP request against the test server.
 * Uses Fastify's inject() — no real HTTP, just in-process routing.
 */
export async function authedRequest(
  sessionToken: string,
  method: InjectOptions["method"],
  url: string,
  body?: unknown,
) {
  const server = await getTestApp();
  const headers: Record<string, string> = {
    cookie: `better-auth.session_token=${sessionToken}`,
    "x-channel": "bushpop",
  };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  return server.inject({
    method,
    url,
    headers,
    payload: body as string,
  });
}

/**
 * Make an unauthenticated HTTP request (public endpoints).
 */
export async function publicRequest(
  method: InjectOptions["method"],
  url: string,
) {
  const server = await getTestApp();
  return server.inject({
    method,
    url,
    headers: {
      "x-channel": "bushpop",
    },
  });
}
