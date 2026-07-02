import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { auth } from "../lib/auth.js";

async function authPluginFn(app: FastifyInstance) {
  // Rate-limit the entire /api/auth/* proxy to 10 req/min per IP.
  // allowList bypasses the limit in the test environment — all integration
  // tests share the loopback address (127.0.0.1) and would otherwise exhaust
  // the bucket across the suite before individual tests can run.
  app.all("/api/auth/*", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: "1 minute",
        keyGenerator: (req: FastifyRequest) => req.ip,
        allowList: (_req: FastifyRequest, _key: string) => process.env.NODE_ENV === "test",
      },
    },
  }, async (request, reply) => {
    const url = `${request.protocol}://${request.hostname}${request.url}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      } else {
        headers.set(key, value);
      }
    }

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const webRequest = new Request(url, {
      method: request.method,
      headers,
      body: hasBody && request.body ? JSON.stringify(request.body) : undefined,
    });

    const response = await auth.handler(webRequest);

    // Copy response headers to Fastify reply
    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });

    reply.status(response.status);
    const body = await response.text();
    return reply.send(body);
  });
}

export const authPlugin = fp(authPluginFn, {
  name: "auth",
});
