import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import { idempotencyMiddleware } from "../../../../middleware/idempotency.js";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { payoutHolds } from "@bushpop/db/schema";
import {
  releasePayoutHold,
  unfreezePayoutHold,
  hasReachableRefundAtStripe,
} from "../../../../lib/payout-hold-service.js";
import { dispatchEvent } from "../../../../lib/events.js";
import { AppError, NotFoundError, ConflictError, ValidationError } from "../../../../lib/errors.js";

// `@fastify/rate-limit`'s onRoute hook pushes its handler onto whatever array
// object is passed as `preHandler`, for every route, whether or not that route
// declares `config.rateLimit`. Two routes sharing one array *reference* would
// therefore share a single limiter bucket. Build a fresh array per route.
const adminReadPreHandlers = () => [requireAuth, requireRole("admin")];
const adminPreHandlers = () => [requireAuth, requireRole("admin"), idempotencyMiddleware];

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
      preHandler: adminReadPreHandlers(),
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
      preHandler: adminPreHandlers(),
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

  // POST /api/v1/admin/payouts/:holdId/unfreeze — clear `frozen_at` on a
  // stranded hold.
  //
  // A hold is frozen by `freezePayoutHold()` (refund start, dispute opened).
  // It is normally unfrozen only by the `charge.dispute.closed` handler on a
  // `won` dispute — so a hold frozen by a refund that failed before it ever
  // reached Stripe has no path back and can never be released. That, and only
  // that, is what this route exists to recover.
  //
  // This route ONLY clears the freeze flag. It moves no money and does not
  // release the payout: the operator must still call the release route, which
  // re-applies every money-safety gate.
  //
  // Status is NOT sufficient authority here, and an earlier version of this
  // route wrongly assumed it was. A lost chargeback and a crashed refund BOTH
  // leave the hold at `status = 'held'` with `frozen_at` set — freezing never
  // touches status. Clearing the freeze on either would let the seller be paid
  // for money the platform no longer holds. So the gate is provenance:
  //
  //   frozen_reason = 'dispute' → refuse. A won dispute unfreezes itself via
  //       the webhook; a lost one must stay frozen forever.
  //   frozen_reason = 'refund'  → refuse if the payment-operations WAL shows a
  //       refund for this order that reached (or may have reached) Stripe.
  //       `refunds.status` is NOT consulted: finalisation runs after
  //       `refunds.create` returns, so a crash there leaves the row 'failed'
  //       while Stripe shows a successful refund.
  //   frozen_reason = NULL      → refuse. Provenance unknown (frozen before this
  //       column existed). Fail closed.
  app.post(
    "/api/v1/admin/payouts/:holdId/unfreeze",
    {
      preHandler: adminPreHandlers(),
      schema: {
        tags: ["Admin - Payouts"],
        summary: "Clear a stranded freeze on a payout hold (admin only)",
        params: z.object({ holdId: z.string().length(26) }),
        body: z.object({ reason: z.string().min(1).max(500) }),
        response: {
          200: z.object({
            id: z.string(),
            orderId: z.string(),
            status: z.string(),
            frozen: z.boolean(),
            unfrozen: z.boolean(),
          }),
        },
      },
    },
    async (request) => {
      const { holdId } = request.params as { holdId: string };
      const { reason } = request.body as { reason: string };

      const [pre] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
      if (!pre) {
        throw new NotFoundError("Payout hold not found");
      }
      if (pre.frozenAt === null) {
        throw new ConflictError("Payout hold is not frozen.");
      }
      if (pre.status !== "held" && pre.status !== "release_failed_retryable") {
        throw new ConflictError(
          `Cannot unfreeze a payout in status '${pre.status}'. Only 'held' or 'release_failed_retryable' payouts can be unfrozen.`,
        );
      }

      // Provenance gate — see the block comment above. This, not `status`, is
      // what keeps a lost chargeback or a completed refund from being released.
      if (pre.frozenReason === "dispute") {
        throw new ConflictError(
          "This payout is frozen because of a chargeback and cannot be unfrozen here. " +
            "A dispute resolved in our favour unfreezes the hold automatically; a lost " +
            "dispute must stay frozen — the funds have already left the platform.",
        );
      }
      if (pre.frozenReason !== "refund") {
        throw new ConflictError(
          "This payout's freeze has no recorded reason, so it cannot be proven safe to clear. " +
            "Reconcile the order against Stripe manually.",
        );
      }
      if (await hasReachableRefundAtStripe(pre.orderId)) {
        throw new ConflictError(
          "A refund for this order reached Stripe (or its outcome is unresolved), so the " +
            "buyer may already have their money back. Releasing this payout would pay the " +
            "seller as well. Reconcile the refund first.",
        );
      }

      // Shared core: takes the same per-hold advisory lock as freeze/release,
      // so this can never interleave with a release's under-lock re-check.
      const unfrozen = await unfreezePayoutHold(pre.orderId);

      const [hold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, holdId));
      if (!hold) {
        throw new NotFoundError("Payout hold not found");
      }

      if (unfrozen) {
        // Fire-and-forget audit event — mirrors the admin refund/cancel routes.
        dispatchEvent({
          eventName: "payout.unfrozen",
          category: "payout",
          actorId: request.user!.id,
          entityType: "payout_hold",
          entityId: holdId,
          metadata: { orderId: pre.orderId, reason, unfrozenBy: "admin" },
        }).catch((err) => {
          request.log.error({ err }, "[admin/payouts] Failed to dispatch payout.unfrozen");
        });
      }

      return {
        id: hold.id,
        orderId: hold.orderId,
        status: hold.status,
        frozen: hold.frozenAt !== null,
        unfrozen,
      };
    },
  );
}
