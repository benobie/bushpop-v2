import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import {
  batchItemsResponseSchema,
  batchSummarySchema,
  bulkPublishRequestSchema,
  bulkPublishResultSchema,
  createBatchDraftsSchema,
  createBatchSchema,
  listBatchesQuerySchema,
} from "./schemas.js";
import {
  createBatch,
  createBatchDrafts,
  exportBatchCsv,
  listBatches,
  listBatchItems,
  publishBatch,
} from "./service.js";

const requireSeller = requireRole("seller");
// Same gotcha as drafts/routes.ts: @fastify/rate-limit pushes onto whatever
// preHandler array it's given, so this MUST be a factory, never a shared
// const array (see that file's comment for the full story).
const sellerPreHandlers = () => [requireAuth, requireSeller];
const batchIdParam = z.object({ id: z.string().length(26) });

// Internal ops tool, single seller at launch — generous but real limits so
// one runaway client can't hammer the DB/AI provider in a loop.
const RATE_LIMITS = {
  crud: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  publish: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  export: { rateLimit: { max: 20, timeWindow: "1 minute" } },
} as const;

export async function sellerBulkRoutes(app: FastifyInstance) {
  // POST /api/v1/seller/bulk/batches — start a new intake batch
  app.post("/api/v1/seller/bulk/batches", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.crud,
    schema: {
      tags: ["Seller - Bulk Listing"],
      summary: "Start a new bulk-listing intake batch",
      body: createBatchSchema,
      response: { 201: batchSummarySchema },
    },
  }, async (request, reply) => {
    const { label } = request.body as z.infer<typeof createBatchSchema>;
    const batch = await createBatch(request.user!.id, label);
    return reply.status(201).send(batch);
  });

  // GET /api/v1/seller/bulk/batches — recent batches (resume lookup)
  app.get("/api/v1/seller/bulk/batches", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.crud,
    schema: {
      tags: ["Seller - Bulk Listing"],
      summary: "List recent bulk-listing batches",
      querystring: listBatchesQuerySchema,
      response: { 200: z.object({ batches: z.array(batchSummarySchema) }) },
    },
  }, async (request) => {
    const { limit } = request.query as z.infer<typeof listBatchesQuerySchema>;
    return listBatches(request.user!.id, limit);
  });

  // GET /api/v1/seller/bulk/batches/:id — batch + all items (review grid)
  app.get("/api/v1/seller/bulk/batches/:id", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.crud,
    schema: {
      tags: ["Seller - Bulk Listing"],
      summary: "Get a batch with all its draft items (photos/strength/AI status)",
      params: batchIdParam,
      response: { 200: batchItemsResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    return listBatchItems(id, request.user!.id);
  });

  // POST /api/v1/seller/bulk/batches/:id/drafts — create N empty drafts
  app.post("/api/v1/seller/bulk/batches/:id/drafts", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.crud,
    schema: {
      tags: ["Seller - Bulk Listing"],
      summary: "Create N empty drafts tagged to this batch, ready for photo intake",
      params: batchIdParam,
      body: createBatchDraftsSchema,
      response: { 201: batchItemsResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { count } = request.body as z.infer<typeof createBatchDraftsSchema>;
    const result = await createBatchDrafts(id, request.user!.id, count);
    return reply.status(201).send(result);
  });

  // POST /api/v1/seller/bulk/batches/:id/publish — publish every ready item
  // in the batch through the SAME gate as /sell (publishDraft, one at a
  // time, no parallel path). Partial success is expected and reported.
  app.post("/api/v1/seller/bulk/batches/:id/publish", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.publish,
    schema: {
      tags: ["Seller - Bulk Listing"],
      summary: "Publish every ready draft in the batch (partial success reported per item)",
      params: batchIdParam,
      body: bulkPublishRequestSchema,
      response: { 200: bulkPublishResultSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { legalAgree } = request.body as z.infer<typeof bulkPublishRequestSchema>;
    return publishBatch(id, request.user!.id, request.channel.id, legalAgree);
  });

  // GET /api/v1/seller/bulk/batches/:id/export.csv — crosslisting export
  app.get("/api/v1/seller/bulk/batches/:id/export.csv", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.export,
    schema: {
      tags: ["Seller - Bulk Listing"],
      summary: "Export the batch as CSV for crosslisting ops",
      params: batchIdParam,
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const csv = await exportBatchCsv(id, request.user!.id);
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="batch-${id}.csv"`)
      .send(csv);
  });
}
