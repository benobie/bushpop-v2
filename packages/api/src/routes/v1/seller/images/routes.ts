import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import {
  uploadUrlRequestSchema,
  confirmUploadSchema,
  batchReorderSchema,
  uploadUrlResponseSchema,
  imageResponseSchema,
} from "./schemas.js";
import {
  requestUploadUrl,
  confirmUpload,
  batchReorderImages,
  deleteImage,
} from "./service.js";

// Factory, not a shared array: @fastify/rate-limit pushes its handler onto the
// preHandler array it is handed, for every route. Two routes sharing one array
// reference would silently share a single limiter bucket.
const sellerPreHandlers = () => [requireAuth, requireRole("seller")];

export async function sellerImageRoutes(app: FastifyInstance) {
  // POST /api/v1/seller/inventory/:id/images/upload-url
  app.post("/api/v1/seller/inventory/:id/images/upload-url", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Images"],
      summary: "Request presigned upload URL",
      params: z.object({ id: z.string().length(26) }),
      body: uploadUrlRequestSchema,
      response: { 200: uploadUrlResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { contentType } = request.body as z.infer<typeof uploadUrlRequestSchema>;
    return requestUploadUrl(id, request.user!.id, contentType);
  });

  // POST /api/v1/seller/inventory/:id/images/:imageId/confirm
  app.post("/api/v1/seller/inventory/:id/images/:imageId/confirm", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Images"],
      summary: "Confirm image upload",
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

  // PATCH /api/v1/seller/inventory/:id/images/order
  app.patch("/api/v1/seller/inventory/:id/images/order", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Images"],
      summary: "Batch reorder images",
      params: z.object({ id: z.string().length(26) }),
      body: batchReorderSchema,
      response: { 200: z.array(imageResponseSchema) },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as z.infer<typeof batchReorderSchema>;
    return batchReorderImages(id, request.user!.id, body);
  });

  // DELETE /api/v1/seller/inventory/:id/images/:imageId
  app.delete("/api/v1/seller/inventory/:id/images/:imageId", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Images"],
      summary: "Delete an image",
      params: z.object({
        id: z.string().length(26),
        imageId: z.string().length(26),
      }),
      response: { 204: z.null() },
    },
  }, async (request, reply) => {
    const { id, imageId } = request.params as { id: string; imageId: string };
    await deleteImage(id, imageId, request.user!.id);
    return reply.status(204).send();
  });
}
