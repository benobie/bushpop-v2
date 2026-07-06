import { z } from "zod";

export const listPayoutsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
});

export const payoutResponseSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  status: z.string(),
  amountCents: z.number(),
  currency: z.string(),
  createdAt: z.string().datetime(),
});

export const payoutsListResponseSchema = z.object({
  items: z.array(payoutResponseSchema),
  totalsByStatus: z.array(
    z.object({
      status: z.string(),
      totalCents: z.number(),
    }),
  ),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});
