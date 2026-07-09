import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../middleware/require-auth.js";
import { db } from "@bushpop/db/client";
import { userRoles } from "@bushpop/db/schema";
import { eq } from "drizzle-orm";

export async function meRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/customer/me",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["Customer"],
        summary: "Get current user profile",
        response: {
          200: z.object({
            user: z.object({
              id: z.string(),
              email: z.string(),
              name: z.string(),
              image: z.string().nullable(),
              emailVerified: z.boolean(),
              isAnonymous: z.boolean(),
            }),
            roles: z.array(z.string()),
            channel: z.object({
              id: z.string(),
              slug: z.string(),
              name: z.string(),
            }),
          }),
        },
      },
    },
    async (request, _reply) => {
      const roles = await db
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, request.user!.id));

      return {
        user: request.user!,
        roles: roles.map((r) => r.role),
        channel: {
          id: request.channel.id,
          slug: request.channel.slug,
          name: request.channel.name,
        },
      };
    },
  );
}
