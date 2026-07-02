import type { FastifyRequest, FastifyReply } from "fastify";
import { db } from "@bushpop/db/client";
import { idempotencyKeys } from "@bushpop/db/schema";
import { eq, and } from "drizzle-orm";
import { ConflictError } from "../lib/errors.js";

/**
 * Per-request idempotency context stored on the request object.
 * Set by idempotencyMiddleware; consumed by the onSend hook in registerIdempotencyHook.
 */
interface IdempotencyContext {
  key: string;
  userId: string;
  operation: string;
}

declare module "fastify" {
  interface FastifyRequest {
    idempotencyContext?: IdempotencyContext;
  }
}

/**
 * preHandler middleware — checks for an existing idempotency key and either
 * returns a cached response or marks the key as "processing".
 *
 * Call registerIdempotencyHook(app) once at server startup to wire up the
 * companion onSend hook that persists the response.
 */
export async function idempotencyMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Only applies to state-changing methods
  if (!["POST", "PUT", "PATCH"].includes(request.method)) return;

  const idempotencyKey = request.headers["idempotency-key"] as string | undefined;
  if (!idempotencyKey) return; // No key = no idempotency check

  const userId = request.user?.id ?? "anonymous";
  const operation = `${request.method}:${request.routeOptions.url ?? request.url}`;

  // Check for existing key
  const existing = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.key, idempotencyKey),
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.operation, operation),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const record = existing[0]!;

    if (record.status === "processing") {
      throw new ConflictError("Request is already being processed");
    }

    if (record.status === "completed" && record.responseStatus && record.responseBody) {
      // Return cached response
      return reply
        .status(record.responseStatus)
        .header("x-idempotent-replayed", "true")
        .send(JSON.parse(record.responseBody) as unknown);
    }
  }

  // Insert new idempotency key
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h TTL
  await db.insert(idempotencyKeys).values({
    key: idempotencyKey,
    userId,
    operation,
    status: "processing",
    expiresAt,
  });

  // Attach context so the companion onSend hook can persist the response
  request.idempotencyContext = { key: idempotencyKey, userId, operation };
}

/**
 * Register once on the Fastify instance (e.g. in server.ts) to persist
 * completed responses back to the idempotency_keys table.
 */
export function registerIdempotencyHook(
  app: import("fastify").FastifyInstance,
): void {
  app.addHook("onSend", async (request, _reply, payload) => {
    const ctx = request.idempotencyContext;
    if (!ctx) return payload;

    try {
      await db
        .update(idempotencyKeys)
        .set({
          status: "completed",
          responseStatus: _reply.statusCode,
          responseBody: typeof payload === "string" ? payload : JSON.stringify(payload),
        })
        .where(
          and(
            eq(idempotencyKeys.key, ctx.key),
            eq(idempotencyKeys.userId, ctx.userId),
            eq(idempotencyKeys.operation, ctx.operation),
          ),
        );
    } catch (err) {
      request.log.error(err, "Failed to update idempotency key");
    }
    return payload;
  });
}
