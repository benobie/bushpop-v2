import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { channelListings, inventoryItems, listingScores, user } from "@bushpop/db/schema";
import { requireAuth } from "../../../middleware/require-auth.js";
import { requireRole } from "../../../middleware/require-role.js";
import { NotFoundError } from "../../../lib/errors.js";

// Factory, not a shared array: @fastify/rate-limit pushes its handler onto the
// preHandler array it is handed, for every route. Two routes sharing one array
// reference would silently share a single limiter bucket.
const adminPreHandlers = () => [requireAuth, requireRole("admin")];

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
});

const listingSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  priceCents: z.number(),
  currency: z.string(),
  ownerId: z.string(),
  ownerName: z.string().nullable(),
  score: z.number().nullable(),
  createdAt: z.string().datetime(),
});

const listingDetailSchema = listingSummarySchema.extend({
  description: z.string().nullable(),
  handle: z.string(),
  publishedAt: z.string().datetime().nullable(),
  hiddenAt: z.string().datetime().nullable(),
  ownerEmail: z.string().nullable(),
  lifecycleState: z.string(),
  availabilityStatus: z.string(),
  brand: z.string().nullable(),
  condition: z.string().nullable(),
  scoreBreakdown: z.record(z.string(), z.number()).nullable(),
});

export async function adminListingRoutes(app: FastifyInstance) {
  // GET /api/v1/admin/listings — list channel listings (read-only)
  app.get(
    "/api/v1/admin/listings",
    {
      preHandler: adminPreHandlers(),
      schema: {
        tags: ["Admin - Listings"],
        summary: "List channel listings (admin only)",
        querystring: listQuerySchema,
        response: {
          200: z.object({
            items: z.array(listingSummarySchema),
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
      const where = status ? eq(channelListings.status, status) : undefined;

      const [items, countResult] = await Promise.all([
        db
          .select({
            id: channelListings.id,
            title: channelListings.title,
            status: channelListings.status,
            priceCents: channelListings.priceCents,
            currency: channelListings.currency,
            ownerId: inventoryItems.ownerId,
            ownerName: user.name,
            score: listingScores.score,
            createdAt: channelListings.createdAt,
          })
          .from(channelListings)
          .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
          .leftJoin(user, eq(inventoryItems.ownerId, user.id))
          .leftJoin(listingScores, eq(listingScores.channelListingId, channelListings.id))
          .where(where)
          .orderBy(desc(channelListings.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(channelListings).where(where),
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

  // GET /api/v1/admin/listings/:id — listing detail (read-only)
  app.get(
    "/api/v1/admin/listings/:id",
    {
      preHandler: adminPreHandlers(),
      schema: {
        tags: ["Admin - Listings"],
        summary: "Get channel listing detail (admin only)",
        params: z.object({ id: z.string().length(26) }),
        response: { 200: listingDetailSchema },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };

      const [row] = await db
        .select({
          id: channelListings.id,
          title: channelListings.title,
          description: channelListings.description,
          status: channelListings.status,
          priceCents: channelListings.priceCents,
          currency: channelListings.currency,
          handle: channelListings.handle,
          publishedAt: channelListings.publishedAt,
          hiddenAt: channelListings.hiddenAt,
          createdAt: channelListings.createdAt,
          ownerId: inventoryItems.ownerId,
          lifecycleState: inventoryItems.lifecycleState,
          availabilityStatus: inventoryItems.availabilityStatus,
          brand: inventoryItems.brand,
          condition: inventoryItems.condition,
          ownerName: user.name,
          ownerEmail: user.email,
          score: listingScores.score,
          scoreBreakdown: listingScores.breakdown,
        })
        .from(channelListings)
        .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
        .leftJoin(user, eq(inventoryItems.ownerId, user.id))
        .leftJoin(listingScores, eq(listingScores.channelListingId, channelListings.id))
        .where(eq(channelListings.id, id));

      if (!row) {
        throw new NotFoundError("Listing not found");
      }

      return {
        ...row,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        hiddenAt: row.hiddenAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        scoreBreakdown: row.scoreBreakdown ?? null,
      };
    },
  );
}
