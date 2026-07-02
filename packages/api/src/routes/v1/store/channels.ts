import type { FastifyInstance } from "fastify";
import { z } from "zod";

export async function channelRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/store/channels/current",
    {
      schema: {
        tags: ["Store"],
        summary: "Get current channel",
        response: {
          200: z.object({
            id: z.string(),
            slug: z.string(),
            name: z.string(),
            domain: z.string().nullable(),
            platformFeeBps: z.number(),
            currency: z.string(),
            supportEmail: z.string().nullable(),
            logoUrl: z.string().nullable(),
            faviconUrl: z.string().nullable(),
            theme: z.unknown().nullable(),
            isActive: z.boolean(),
          }),
        },
      },
    },
    async (request, _reply) => {
      return request.channel;
    },
  );
}
