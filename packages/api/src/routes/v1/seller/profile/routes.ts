import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../../middleware/require-auth.js";
import { requireRole } from "../../../../middleware/require-role.js";
import {
  sellerProfileResponseSchema,
  patchSellerProfileSchema,
  avatarUploadUrlRequestSchema,
  avatarUploadUrlResponseSchema,
  avatarConfirmRequestSchema,
  avatarConfirmResponseSchema,
} from "./schemas.js";
import {
  getOwnSellerProfile,
  patchSellerProfile,
  requestAvatarUploadUrl,
  confirmAvatarUpload,
} from "./service.js";

// Factory, not a shared array: @fastify/rate-limit pushes its handler onto the
// preHandler array it is handed, for every route. Two routes sharing one array
// reference would silently share a single limiter bucket.
const sellerPreHandlers = () => [requireAuth, requireRole("seller")];

export async function sellerProfileRoutes(app: FastifyInstance) {
  // GET /api/v1/seller/profile — get own profile
  app.get("/api/v1/seller/profile", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Profile"],
      summary: "Get own seller profile",
      response: { 200: sellerProfileResponseSchema },
    },
  }, async (request) => {
    return getOwnSellerProfile(request.user!.id);
  });

  // PATCH /api/v1/seller/profile — update storeName, bio, handle, vacationMode
  app.patch("/api/v1/seller/profile", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Profile"],
      summary: "Update seller profile",
      body: patchSellerProfileSchema,
      response: { 200: sellerProfileResponseSchema },
    },
  }, async (request) => {
    return patchSellerProfile(
      request.user!.id,
      request.body as z.infer<typeof patchSellerProfileSchema>,
    );
  });

  // POST /api/v1/seller/profile/avatar/upload-url — presigned PUT for avatar
  app.post("/api/v1/seller/profile/avatar/upload-url", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Profile"],
      summary: "Request presigned upload URL for avatar",
      body: avatarUploadUrlRequestSchema,
      response: { 200: avatarUploadUrlResponseSchema },
    },
  }, async (request) => {
    const { contentType } = request.body as z.infer<typeof avatarUploadUrlRequestSchema>;
    return requestAvatarUploadUrl(request.user!.id, contentType);
  });

  // POST /api/v1/seller/profile/avatar/confirm — confirm avatar uploaded
  app.post("/api/v1/seller/profile/avatar/confirm", {
    preHandler: sellerPreHandlers(),
    schema: {
      tags: ["Seller - Profile"],
      summary: "Confirm avatar upload and update profile",
      body: avatarConfirmRequestSchema,
      response: { 200: avatarConfirmResponseSchema },
    },
  }, async (request) => {
    const { storageKey } = request.body as z.infer<typeof avatarConfirmRequestSchema>;
    return confirmAvatarUpload(request.user!.id, storageKey);
  });
}
