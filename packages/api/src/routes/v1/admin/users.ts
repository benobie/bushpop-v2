import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../middleware/require-auth.js";
import { requireRole } from "../../../middleware/require-role.js";
import { db } from "@bushpop/db/client";
import { user } from "@bushpop/db/schema";
import { sql, desc } from "drizzle-orm";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function adminUserRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/admin/users",
    {
      preHandler: [requireAuth, requireRole("admin")],
      schema: {
        tags: ["Admin"],
        summary: "List all users (admin only)",
        querystring: querySchema,
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                email: z.string(),
                emailVerified: z.boolean(),
                image: z.string().nullable(),
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
    async (request, _reply) => {
      const { page, limit } = request.query as z.infer<typeof querySchema>;
      const offset = (page - 1) * limit;

      const [items, countResult] = await Promise.all([
        db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            image: user.image,
            createdAt: user.createdAt,
          })
          .from(user)
          .orderBy(desc(user.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(user),
      ]);

      const total = countResult[0]?.count ?? 0;

      return {
        items: items.map((item) => ({
          ...item,
          image: item.image ?? null,
          createdAt: item.createdAt.toISOString(),
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    },
  );
}
