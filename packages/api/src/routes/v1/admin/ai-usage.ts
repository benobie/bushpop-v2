import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { aiGenerations } from "@bushpop/db/schema";
import { requireAuth } from "../../../middleware/require-auth.js";
import { requireRole } from "../../../middleware/require-role.js";

const adminPreHandlers = [requireAuth, requireRole("admin")];

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function adminAiUsageRoutes(app: FastifyInstance) {
  // GET /api/v1/admin/ai-usage/summary — aggregate cost/token/status totals
  app.get(
    "/api/v1/admin/ai-usage/summary",
    {
      preHandler: adminPreHandlers,
      schema: {
        tags: ["Admin - AI Usage"],
        summary: "AI draft generation cost + usage summary (admin only)",
        response: {
          200: z.object({
            totalGenerations: z.number(),
            totalCostUsdMicros: z.number(),
            byStatus: z.array(z.object({ status: z.string(), count: z.number() })),
            byProvider: z.array(
              z.object({ provider: z.string(), count: z.number(), costUsdMicros: z.number() }),
            ),
          }),
        },
      },
    },
    async () => {
      const [totals] = await db
        .select({
          totalGenerations: sql<number>`count(*)::int`,
          totalCostUsdMicros: sql<number>`coalesce(sum(${aiGenerations.costUsdMicros}), 0)::int`,
        })
        .from(aiGenerations);

      const byStatus = await db
        .select({
          status: aiGenerations.status,
          count: sql<number>`count(*)::int`,
        })
        .from(aiGenerations)
        .groupBy(aiGenerations.status);

      const byProvider = await db
        .select({
          provider: aiGenerations.provider,
          count: sql<number>`count(*)::int`,
          costUsdMicros: sql<number>`coalesce(sum(${aiGenerations.costUsdMicros}), 0)::int`,
        })
        .from(aiGenerations)
        .groupBy(aiGenerations.provider);

      return {
        totalGenerations: totals?.totalGenerations ?? 0,
        totalCostUsdMicros: totals?.totalCostUsdMicros ?? 0,
        byStatus,
        byProvider,
      };
    },
  );

  // GET /api/v1/admin/ai-usage — recent generation rows (read-only)
  app.get(
    "/api/v1/admin/ai-usage",
    {
      preHandler: adminPreHandlers,
      schema: {
        tags: ["Admin - AI Usage"],
        summary: "List recent AI draft generations (admin only)",
        querystring: listQuerySchema,
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                sellerId: z.string(),
                inventoryItemId: z.string(),
                trigger: z.string(),
                provider: z.string(),
                model: z.string(),
                status: z.string(),
                costUsdMicros: z.number().nullable(),
                latencyMs: z.number().nullable(),
                confidence: z.number().nullable(),
                createdAt: z.string().datetime(),
              }),
            ),
            page: z.number(),
            limit: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const { page, limit } = request.query as z.infer<typeof listQuerySchema>;
      const offset = (page - 1) * limit;

      const items = await db
        .select({
          id: aiGenerations.id,
          sellerId: aiGenerations.sellerId,
          inventoryItemId: aiGenerations.inventoryItemId,
          trigger: aiGenerations.trigger,
          provider: aiGenerations.provider,
          model: aiGenerations.model,
          status: aiGenerations.status,
          costUsdMicros: aiGenerations.costUsdMicros,
          latencyMs: aiGenerations.latencyMs,
          confidence: aiGenerations.confidence,
          createdAt: aiGenerations.createdAt,
        })
        .from(aiGenerations)
        .orderBy(desc(aiGenerations.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        items: items.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        page,
        limit,
      };
    },
  );
}
