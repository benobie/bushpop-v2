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

const sellerPreHandlers = [requireAuth, requireRole("seller")];
const idParam = z.object({ id: z.string().length(26) });

export async function sellerDraftRoutes(app: FastifyInstance) {
  // POST /api/v1/seller/drafts — start a new draft
  app.post("/api/v1/seller/drafts", {
    preHandler: sellerPreHandlers,
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
    preHandler: sellerPreHandlers,
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
    preHandler: sellerPreHandlers,
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
    preHandler: sellerPreHandlers,
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
    preHandler: sellerPreHandlers,
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
    preHandler: sellerPreHandlers,
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
    preHandler: sellerPreHandlers,
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
    preHandler: sellerPreHandlers,
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
    preHandler: sellerPreHandlers,
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
}
