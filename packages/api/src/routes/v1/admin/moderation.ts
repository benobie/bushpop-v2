import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { listingReports, channelListings } from "@bushpop/db/schema";
import { requireAuth } from "../../../middleware/require-auth.js";
import { requireRole } from "../../../middleware/require-role.js";
import { NotFoundError, ConflictError } from "../../../lib/errors.js";
import { dispatchEvent } from "../../../lib/events.js";
import { reportReasonSchema } from "./reports/schemas.js";

const adminPreHandlers = [requireAuth, requireRole("admin")];

const createFlagBodySchema = z.object({
  channelListingId: z.string().length(26),
  reason: reportReasonSchema,
  description: z.string().max(2000).optional(),
});

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; cause?: { code?: unknown } };
  return e.code === "23505" || e.cause?.code === "23505";
}

/**
 * Internal-only intake path: an admin flags a listing directly (no reporter
 * account, no active/not-hidden requirement, no daily cap — those are the
 * public store route's abuse guards, not relevant to staff-initiated flags).
 * Feeds the same listing_reports queue the store report path and B3's admin
 * review PATCH already drive — see docs/takedown-process.md §1.
 */
export async function adminModerationRoutes(app: FastifyInstance) {
  // POST /api/v1/admin/moderation/flags — admin manually flags a listing
  app.post(
    "/api/v1/admin/moderation/flags",
    {
      preHandler: adminPreHandlers,
      schema: {
        tags: ["Admin - Moderation"],
        summary: "Manually flag a listing for review (admin only)",
        body: createFlagBodySchema,
        response: {
          201: z.object({ id: z.string(), status: z.literal("pending") }),
        },
      },
    },
    async (request, reply) => {
      const { channelListingId, reason, description } = request.body as z.infer<
        typeof createFlagBodySchema
      >;
      const actorId = request.user!.id;

      const [listing] = await db
        .select({ id: channelListings.id, channelId: channelListings.channelId })
        .from(channelListings)
        .where(eq(channelListings.id, channelListingId));

      if (!listing) {
        throw new NotFoundError("Listing not found");
      }

      try {
        const [created] = await db
          .insert(listingReports)
          .values({
            channelListingId,
            reporterId: actorId,
            reason,
            description: description ?? null,
            status: "pending",
          })
          .returning({ id: listingReports.id });

        if (!created) {
          throw new Error("Failed to create flag");
        }

        dispatchEvent({
          eventName: "listing.flagged",
          category: "listing",
          actorId,
          entityType: "channel_listing",
          entityId: channelListingId,
          channelId: listing.channelId,
          metadata: { reportId: created.id, reason, source: "admin_manual" },
        }).catch((err: unknown) => {
          console.error("[admin/moderation] Failed to dispatch listing.flagged:", err);
        });

        return reply.status(201).send({ id: created.id, status: "pending" as const });
      } catch (err: unknown) {
        if (isUniqueViolation(err)) {
          throw new ConflictError("An active report already exists for this listing and reporter.");
        }
        throw err;
      }
    },
  );
}
