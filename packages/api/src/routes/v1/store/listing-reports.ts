import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, eq, gte, isNull } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { listingReports, channelListings, inventoryItems } from "@bushpop/db/schema";
import { requireAuth } from "../../../middleware/require-auth.js";
import { requireRealAccount } from "../../../middleware/require-real-account.js";
import { NotFoundError, ConflictError, TooManyRequestsError, ValidationError } from "../../../lib/errors.js";
import { reportReasonSchema } from "./listing-reports-schemas.js";

const DAILY_REPORT_CAP = 10;

const submitReportBodySchema = z.object({
  reason: reportReasonSchema,
  description: z.string().max(2000).optional(),
});

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; cause?: { code?: unknown } };
  return e.code === "23505" || e.cause?.code === "23505";
}

export async function storeListingReportRoutes(app: FastifyInstance) {
  // POST /api/v1/store/listings/:id/report — submit a report on a listing
  app.post(
    "/api/v1/store/listings/:id/report",
    {
      preHandler: [requireAuth, requireRealAccount],
      schema: {
        tags: ["Store"],
        summary: "Report a listing",
        params: z.object({ id: z.string().length(26) }),
        body: submitReportBodySchema,
        response: {
          201: z.object({ id: z.string(), status: z.literal("pending") }),
        },
      },
    },
    async (request, reply) => {
      const { id: channelListingId } = request.params as { id: string };
      const { reason, description } = request.body as z.infer<typeof submitReportBodySchema>;
      const reporterId = request.user!.id;
      const channelId = request.channel.id;

      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);

      const [dailyCount] = await db
        .select({ count: count() })
        .from(listingReports)
        .where(
          and(
            eq(listingReports.reporterId, reporterId),
            gte(listingReports.createdAt, startOfDay),
          ),
        );

      if ((dailyCount?.count ?? 0) >= DAILY_REPORT_CAP) {
        throw new TooManyRequestsError(
          `You can submit a maximum of ${DAILY_REPORT_CAP} reports per day.`,
        );
      }

      const [listing] = await db
        .select({
          id: channelListings.id,
          ownerId: inventoryItems.ownerId,
        })
        .from(channelListings)
        .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
        .where(
          and(
            eq(channelListings.id, channelListingId),
            eq(channelListings.channelId, channelId),
            eq(channelListings.status, "active"),
            isNull(channelListings.hiddenAt),
          ),
        );

      if (!listing) {
        throw new NotFoundError("Listing not found or not active");
      }

      // Block self-reporting
      if (listing.ownerId === reporterId) {
        throw new ValidationError("You cannot report your own listing");
      }

      try {
        const [created] = await db
          .insert(listingReports)
          .values({
            channelListingId,
            reporterId,
            reason,
            description: description ?? null,
            status: "pending",
          })
          .returning({ id: listingReports.id });

        if (!created) {
          throw new Error("Failed to create report");
        }

        return reply.status(201).send({ id: created.id, status: "pending" as const });
      } catch (err: unknown) {
        if (isUniqueViolation(err)) {
          throw new ConflictError("Already reported");
        }
        throw err;
      }
    },
  );
}
