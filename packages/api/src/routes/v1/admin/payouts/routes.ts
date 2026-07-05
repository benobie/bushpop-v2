import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import { idempotencyMiddleware } from "../../../../middleware/idempotency.js";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { payoutHolds } from "@bushpop/db/schema";
import { releasePayoutHold } from "../../../../lib/payout-hold-service.js";
import { AppError, NotFoundError, ConflictError, ValidationError } from "../../../../lib/errors.js";

const adminReadPreHandlers = [requireAuth, requireRole("admin")];
const adminPreHandlers = [requireAuth, requireRole("admin"), idempotencyMiddleware];

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
});

export async function adminPayoutRoutes(app: FastifyInstance) {
  // GET /api/v1/admin/payouts — list payout holds (read-only view)
  app.get(
    "/api/v1/admin/payouts",
    {
      preHandler: adminReadPreHandlers,
      schema: {
        tags: ["Admin - Payouts"],
        summary: "List payout holds (admin only)",
        querystring: listQuerySchema,
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                orderId: z.string(),
                status: z.string(),
                amountCents: z.number(),
                currency: z.string(),
                transferId: z.string().nullable(),
                releaseAttempts: z.number(),
                failureReason: z.string().nullable(),
                createdAt: z.string().datetime(),
              }),
            ),
            total: z.number(),
            page: z.number(),
            limit: z.number(),
            totalPages: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const { page, limit, status } = request.query as z.infer<typeof listQuerySchema>;
      const offset = (page - 1) * limit;
      const where = status ? eq(payoutHolds.status, status) : undefined;

      const [items, countResult] = await Promise.all([
        db
          .select({
            id: payoutHolds.id,
            orderId: payoutHolds.orderId,
            status: payoutHolds.status,
            amountCents: payoutHolds.amountCents,
            currency: payoutHolds.currency,
            transferId: payoutHolds.transferId,
            releaseAttempts: payoutHolds.releaseAttempts,
            failureReason: payoutHolds.failureReason,
            createdAt: payoutHolds.createdAt,
          })
          .from(payoutHolds)
          .where(where)
          .orderBy(desc(payoutHolds.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(payoutHolds).where(where),
      ]);

      const total = countResult[0]?.count ?? 0;

      return {
        items: items.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    },
  );

  // POST /api/v1/admin/payouts/:holdId/release — release payout to seller
  app.post(
    "/api/v1/admin/payouts/:holdId/release",
    {
      preHandler: adminPreHandlers,
      schema: {
        tags: ["Admin - Payouts"],
        summary: "Release payout hold to seller (admin only)",
        params: z.object({ holdId: z.string().length(26) }),
        response: {
          200: z.object({
            id: z.string(),
            orderId: z.string(),
            status: z.string(),
            transferId: z.string().nullable(),
            amountCents: z.number(),
            currency: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const { holdId } = request.params as { holdId: string };

      // Pre-check for a friendly 404 / 409 before invoking the shared core.
      const [pre] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
      if (!pre) {
        throw new NotFoundError("Payout hold not found");
      }
      if (pre.status !== "held" && pre.status !== "release_failed_retryable") {
        throw new ConflictError(
          `Cannot release payout in status '${pre.status}'. Only 'held' or 'release_failed_retryable' payouts can be released.`,
        );
      }

      // All money-safety logic (CAS, frozen-guard, per-attempt idempotency key,
      // List-first-after-5xx, both transfer-id columns, classify+backoff) lives
      // in the shared release core.
      const outcome = await releasePayoutHold(holdId, request.user!.id);

      // Re-read the hold for the response shape after the release attempt.
      const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
      if (!hold) {
        throw new NotFoundError("Payout hold not found");
      }

      switch (outcome.result) {
        case "released":
        case "adopted":
          return {
            id: holdId,
            orderId: hold.orderId,
            status: hold.status,
            transferId: hold.transferId,
            amountCents: hold.amountCents,
            currency: hold.currency,
          };
        case "blocked":
          throw new ValidationError(
            `Seller is not eligible for transfers — payout blocked (${outcome.reason}).`,
          );
        case "skipped":
          // Concurrent change, frozen, or balance-insufficient. The hold's
          // current status is authoritative; surface a 409 so the operator retries.
          throw new ConflictError(
            `Payout could not be released right now: ${outcome.reason}.`,
          );
        case "retryable":
          throw new AppError(
            `Stripe transfer failed; payout will be retried automatically (${outcome.reason}).`,
            502,
            "STRIPE_TRANSFER_FAILED",
          );
        case "manual":
          throw new AppError(
            `Payout release failed and requires manual intervention (${outcome.reason}).`,
            502,
            "STRIPE_TRANSFER_MANUAL",
          );
      }
    },
  );
}
