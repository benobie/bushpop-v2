import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import {
  conditionStepSchema,
  detailsStepSchema,
  draftResponseSchema,
  draftSummaryResponseSchema,
  listDraftsQuerySchema,
  priceStepSchema,
  shippingStepSchema,
} from "./schemas.js";
import {
  createDraft,
  getDraft,
  listDrafts,
  patchCondition,
  patchDetails,
  patchPrice,
  patchShipping,
} from "./service.js";
import {
  uploadUrlRequestSchema,
  confirmUploadSchema,
  uploadUrlResponseSchema,
  imageResponseSchema,
} from "../images/schemas.js";
import { requestUploadUrl, confirmUpload } from "../images/service.js";
import { getAiDraftStatus, requestAiDraft } from "./ai-service.js";
import { duplicateDraft, publishDraft } from "./publish-service.js";

const requireSeller = requireRole("seller");
// MUST be a factory: @fastify/rate-limit PUSHES its per-route preHandler
// onto this array (routeOptions[hook].push). A shared array instance would
// accumulate every route's limiter and the first-registered one would win
// for all 13 routes (found via probe — one shared 60/min bucket).
const sellerPreHandlers = () => [requireAuth, requireSeller];
const idParam = z.object({ id: z.string().length(26) });

// Per-route rate limits (task 10) — keyed by user id via the global
// preHandler keyGenerator (see server.ts; onRequest would degrade to IP).
const RATE_LIMITS = {
  presign: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  aiDraft: { rateLimit: { max: 6, timeWindow: "1 minute" } },
  publish: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  crud: { rateLimit: { max: 60, timeWindow: "1 minute" } },
} as const;

export async function sellerDraftRoutes(app: FastifyInstance) {
  // POST /api/v1/seller/drafts — start a new draft
  app.post("/api/v1/seller/drafts", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.crud,
    schema: {
      tags: ["Seller - Drafts"],
      summary: "Create an empty sell-flow draft",
      response: { 201: draftResponseSchema },
    },
  }, async (request, reply) => {
    const draft = await createDraft(request.user!.id);
    return reply.status(201).send(draft);
  });

  // GET /api/v1/seller/drafts — newest drafts (resume lookup)
  app.get("/api/v1/seller/drafts", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.crud,
    schema: {
      tags: ["Seller - Drafts"],
      summary: "List the seller's open drafts, newest first",
      querystring: listDraftsQuerySchema,
      response: { 200: z.object({ drafts: z.array(draftSummaryResponseSchema) }) },
    },
  }, async (request) => {
    const { limit } = request.query as z.infer<typeof listDraftsQuerySchema>;
    return listDrafts(request.user!.id, limit);
  });

  // GET /api/v1/seller/drafts/:id — item + images + strength
  app.get("/api/v1/seller/drafts/:id", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.crud,
    schema: {
      tags: ["Seller - Drafts"],
      summary: "Get a draft with images, measurement template and strength",
      params: idParam,
      response: { 200: draftResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    return getDraft(id, request.user!.id);
  });

  // ── Per-step PATCHes (optimistic version on every body) ──

  app.patch("/api/v1/seller/drafts/:id/details", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.crud,
    schema: {
      tags: ["Seller - Drafts"],
      summary: "Update details-step fields (title/brand/category/size/colour/description)",
      params: idParam,
      body: detailsStepSchema,
      response: { 200: draftResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    return patchDetails(id, request.user!.id, request.body as z.infer<typeof detailsStepSchema>);
  });

  app.patch("/api/v1/seller/drafts/:id/condition", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.crud,
    schema: {
      tags: ["Seller - Drafts"],
      summary: "Update condition-step fields (condition/notes/measurements)",
      params: idParam,
      body: conditionStepSchema,
      response: { 200: draftResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    return patchCondition(id, request.user!.id, request.body as z.infer<typeof conditionStepSchema>);
  });

  app.patch("/api/v1/seller/drafts/:id/price", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.crud,
    schema: {
      tags: ["Seller - Drafts"],
      summary: "Update price-step fields (asking price / RRP)",
      params: idParam,
      body: priceStepSchema,
      response: { 200: draftResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    return patchPrice(id, request.user!.id, request.body as z.infer<typeof priceStepSchema>);
  });

  app.patch("/api/v1/seller/drafts/:id/shipping", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.crud,
    schema: {
      tags: ["Seller - Drafts"],
      summary: "Update shipping-step fields (option/parcel — derives shipping class)",
      params: idParam,
      body: shippingStepSchema,
      response: { 200: draftResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    return patchShipping(id, request.user!.id, request.body as z.infer<typeof shippingStepSchema>);
  });

  // ── Image aliases over the images service (same guards: max 10, content types) ──

  app.post("/api/v1/seller/drafts/:id/images/upload-url", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.presign,
    schema: {
      tags: ["Seller - Drafts"],
      summary: "Request a presigned upload URL for a draft photo",
      params: idParam,
      body: uploadUrlRequestSchema,
      response: { 200: uploadUrlResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { contentType } = request.body as z.infer<typeof uploadUrlRequestSchema>;
    return requestUploadUrl(id, request.user!.id, contentType);
  });

  app.post("/api/v1/seller/drafts/:id/images/:imageId/confirm", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.presign,
    schema: {
      tags: ["Seller - Drafts"],
      summary: "Confirm a draft photo upload (enqueues variant generation)",
      params: z.object({
        id: z.string().length(26),
        imageId: z.string().length(26),
      }),
      body: confirmUploadSchema,
      response: { 200: imageResponseSchema },
    },
  }, async (request) => {
    const { id, imageId } = request.params as { id: string; imageId: string };
    const body = request.body as z.infer<typeof confirmUploadSchema>;
    return confirmUpload(id, imageId, request.user!.id, body);
  });

  // ── Publish + duplicate (task 8) ──

  app.post("/api/v1/seller/drafts/:id/publish", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.publish,
    schema: {
      tags: ["Seller - Drafts"],
      summary: "Publish a draft — server-side gate, 422 with missing[] when not ready",
      params: idParam,
      body: z.object({
        version: z.number().int().min(1),
        legalAgree: z.boolean(),
      }),
      response: {
        200: z.object({
          listingId: z.string(),
          handle: z.string(),
          itemId: z.string(),
          strength: z.object({
            score: z.number(),
            band: z.string(),
            breakdown: z.record(z.string(), z.number()),
            version: z.string(),
          }),
        }),
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { version: number; legalAgree: boolean };
    return publishDraft(id, request.user!.id, request.channel.id, body);
  });

  app.post("/api/v1/seller/drafts/:id/duplicate", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.crud,
    schema: {
      tags: ["Seller - Drafts"],
      summary: "List another like this — new draft keeping brand/category/colour/shipping",
      params: idParam,
      response: { 201: draftResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const draft = await duplicateDraft(id, request.user!.id);
    return reply.status(201).send(draft);
  });

  // ── AI draft generation (202 + poll — D11/D12) ──

  app.post("/api/v1/seller/drafts/:id/ai-draft", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.aiDraft,
    schema: {
      tags: ["Seller - Drafts"],
      summary: "Request an AI listing draft (202; poll the returned jobId)",
      params: idParam,
      body: z.object({ trigger: z.enum(["auto", "regenerate"]) }),
      response: {
        202: z.object({ jobId: z.string(), status: z.literal("pending") }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { trigger } = request.body as { trigger: "auto" | "regenerate" };
    const result = await requestAiDraft(id, request.user!.id, trigger);
    return reply.status(202).send(result);
  });

  app.get("/api/v1/seller/drafts/:id/ai-draft/:jobId", {
    preHandler: sellerPreHandlers(),
    config: RATE_LIMITS.crud,
    schema: {
      tags: ["Seller - Drafts"],
      summary: "Poll an AI draft generation job",
      params: z.object({
        id: z.string().length(26),
        jobId: z.string().length(26),
      }),
      response: {
        200: z.object({
          jobId: z.string(),
          status: z.enum(["pending", "completed", "failed"]),
          trigger: z.string(),
          suggestions: z
            .object({
              title: z.string(),
              brand: z.string(),
              categoryLeaf: z.string(),
              colour: z.string(),
              description: z.string(),
              confidence: z.number(),
            })
            .nullable(),
          confidence: z.number().nullable(),
          createdAt: z.coerce.date(),
          completedAt: z.coerce.date().nullable(),
        }),
      },
    },
  }, async (request) => {
    const { id, jobId } = request.params as { id: string; jobId: string };
    return getAiDraftStatus(id, request.user!.id, jobId);
  });
}
