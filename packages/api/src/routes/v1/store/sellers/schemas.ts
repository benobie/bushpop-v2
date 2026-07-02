import { z } from "zod";

// ── Response schemas (public fields only) ──

export const storeSellerResponseSchema = z.object({
  id: z.string(),
  handle: z.string(),
  storeName: z.string(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  verifiedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
