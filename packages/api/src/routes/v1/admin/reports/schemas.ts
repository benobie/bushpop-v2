import { z } from "zod";
import { reportReasonSchema } from "../../store/listing-reports-schemas.js";

export { reportReasonSchema };

export const reportStatusSchema = z.enum([
  "pending",
  "reviewed",
  "actioned",
  "dismissed",
]);

export const reportResponseSchema = z.object({
  id: z.string(),
  channelListingId: z.string(),
  channelId: z.string(),
  reporterId: z.string(),
  reason: reportReasonSchema,
  description: z.string().nullable(),
  status: reportStatusSchema,
  version: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const listReportsQuerySchema = z.object({
  channel_id: z.string().optional(),
  status: reportStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const patchReportBodySchema = z.object({
  status: reportStatusSchema,
});
