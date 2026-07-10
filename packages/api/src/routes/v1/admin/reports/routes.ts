import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import {
  listReportsQuerySchema,
  patchReportBodySchema,
  reportResponseSchema,
} from "./schemas.js";
import { listReports, patchReport } from "./service.js";
import type { ReportStatus } from "../../../../lib/report-machines.js";

// Factory, not a shared array: @fastify/rate-limit pushes its handler onto the
// preHandler array it is handed, for every route. Two routes sharing one array
// reference would silently share a single limiter bucket.
const adminPreHandlers = () => [requireAuth, requireRole("admin")];

export async function adminReportRoutes(app: FastifyInstance) {
  // GET /api/v1/admin/reports — list reports with optional filters
  app.get(
    "/api/v1/admin/reports",
    {
      preHandler: adminPreHandlers(),
      schema: {
        tags: ["Admin - Reports"],
        summary: "List listing reports (admin only)",
        querystring: listReportsQuerySchema,
        response: {
          200: z.object({
            items: z.array(reportResponseSchema),
            total: z.number(),
            page: z.number(),
            limit: z.number(),
            totalPages: z.number(),
          }),
        },
      },
    },
    async (request) => {
      const query = request.query as z.infer<typeof listReportsQuerySchema>;
      return listReports({
        channelId: query.channel_id,
        status: query.status as ReportStatus | undefined,
        page: query.page,
        limit: query.limit,
      });
    },
  );

  // PATCH /api/v1/admin/reports/:id — update report status
  app.patch(
    "/api/v1/admin/reports/:id",
    {
      preHandler: adminPreHandlers(),
      schema: {
        tags: ["Admin - Reports"],
        summary: "Update report status (admin only)",
        params: z.object({ id: z.string().length(26) }),
        body: patchReportBodySchema,
        response: {
          200: reportResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { status } = request.body as z.infer<typeof patchReportBodySchema>;
      return patchReport(id, status as ReportStatus, request.user!.id);
    },
  );
}
