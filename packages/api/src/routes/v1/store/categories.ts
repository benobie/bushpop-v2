import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "@bushpop/db/client";
import { categories } from "@bushpop/db/schema";
import { eq, and, isNull, or } from "drizzle-orm";

export async function storeCategoryRoutes(app: FastifyInstance) {
  app.get("/api/v1/store/categories", {
    schema: {
      tags: ["Store"],
      summary: "List categories (channel-scoped + global)",
      querystring: z.object({
        parentId: z.string().length(26).optional(),
      }),
      response: {
        200: z.object({
          items: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              slug: z.string(),
              parentId: z.string().nullable(),
              channelId: z.string().nullable(),
            }),
          ),
        }),
      },
    },
  }, async (request) => {
    const { parentId } = request.query as { parentId?: string };
    const channelId = request.channel.id;

    const conditions = [];

    // Channel-specific OR global (null channelId)
    conditions.push(
      or(
        eq(categories.channelId, channelId),
        isNull(categories.channelId),
      )!,
    );

    if (parentId) {
      conditions.push(eq(categories.parentId, parentId));
    } else {
      conditions.push(isNull(categories.parentId));
    }

    const rows = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        parentId: categories.parentId,
        channelId: categories.channelId,
      })
      .from(categories)
      .where(and(...conditions));

    return { items: rows };
  });
}
