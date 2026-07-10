import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getFailedEmailJobs } from "../../../workers/email.js";
import { requireAuth } from "../../../middleware/require-auth.js";
import { requireRole } from "../../../middleware/require-role.js";

// Factory, not a shared array: @fastify/rate-limit pushes its handler onto the
// preHandler array it is handed, for every route. Two routes sharing one array
// reference would silently share a single limiter bucket.
const adminPreHandlers = () => [requireAuth, requireRole("admin")];

// GET /api/v1/admin/email-jobs/failed — the email worker's dead-letter queue.
//
// getFailedEmailJobs() (shipped PR #62) reads BullMQ's `email` queue failed
// jobs directly — this is a live Redis-backed view, not a DB table, so
// there's no pagination: BullMQ retains a small `removeOnFail` window.
export async function adminEmailJobRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/admin/email-jobs/failed",
    {
      preHandler: adminPreHandlers(),
      schema: {
        tags: ["Admin - Email Jobs"],
        summary: "List failed (dead-letter) email jobs (admin only)",
        response: {
          200: z.object({
            items: z.array(
              z.object({
                jobId: z.string(),
                type: z.string(),
                orderId: z.string(),
                failedReason: z.string().nullable(),
                attemptsMade: z.number(),
              }),
            ),
          }),
        },
      },
    },
    async () => {
      const jobs = await getFailedEmailJobs();
      return {
        items: jobs.map((job) => ({
          ...job,
          failedReason: job.failedReason ?? null,
        })),
      };
    },
  );
}
