import { z } from "zod";

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export const sellerProfileResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  storeName: z.string(),
  handle: z.string(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  vacationMode: z.boolean(),
  stripeChargesEnabled: z.boolean(),
  stripePayoutsEnabled: z.boolean(),
  verifiedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type SellerProfileResponse = z.infer<typeof sellerProfileResponseSchema>;

// ---------------------------------------------------------------------------
// PATCH body
// ---------------------------------------------------------------------------

export const patchSellerProfileSchema = z.object({
  storeName: z.string().min(1).max(100).optional(),
  bio: z.string().max(1000).nullable().optional(),
  handle: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Handle must be lowercase alphanumeric with hyphens").optional(),
  vacationMode: z.boolean().optional(),
  defaultShippingAddressId: z.string().length(26).nullable().optional(),
});

export type PatchSellerProfile = z.infer<typeof patchSellerProfileSchema>;

// ---------------------------------------------------------------------------
// Avatar upload
// ---------------------------------------------------------------------------

export const avatarUploadUrlRequestSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export type AvatarUploadUrlRequest = z.infer<typeof avatarUploadUrlRequestSchema>;

export const avatarUploadUrlResponseSchema = z.object({
  uploadUrl: z.string(),
  storageKey: z.string(),
  expiresIn: z.number(),
});

export const avatarConfirmRequestSchema = z.object({
  storageKey: z.string().min(1),
});

export const avatarConfirmResponseSchema = z.object({
  avatarUrl: z.string(),
});
