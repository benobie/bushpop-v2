import { z } from "zod";

export const uploadUrlRequestSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export const confirmUploadSchema = z.object({
  position: z.number().int().min(0).default(0),
  isPrimary: z.boolean().default(false),
});

export const batchReorderSchema = z.array(
  z.object({
    imageId: z.string().length(26),
    position: z.number().int().min(0),
    isPrimary: z.boolean().optional(),
  }),
).min(1);

export const uploadUrlResponseSchema = z.object({
  uploadUrl: z.string(),
  imageId: z.string(),
  expiresAt: z.string(),
});

export const imageResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  status: z.string(),
  position: z.number(),
  isPrimary: z.boolean(),
  confirmedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
