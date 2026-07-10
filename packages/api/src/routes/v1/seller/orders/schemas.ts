import { z } from "zod";
import { orderResponseSchema, listOrdersQuerySchema } from "../../store/orders/schemas.js";

export { listOrdersQuerySchema };

// The seller sees their own payout breakdown. `platformFeeCents` and
// `sellerProceedsCents` live here rather than on the shared buyer schema —
// they are the seller's own commercial data, not the buyer's.
export const sellerOrderResponseSchema = orderResponseSchema.extend({
  platformFeeCents: z.number().int().nonnegative(),
  sellerProceedsCents: z.number().int().nonnegative(),
  shippingLabelUrl: z.string().nullable(),
});

export const markShippedBodySchema = z.object({
  trackingNumber: z.string().min(1),
  carrier: z.string().min(1),
});

export const confirmPickupBodySchema = z.object({
  code: z.string().length(6),
});

export const confirmPickupResponseSchema = z.object({
  orderId: z.string(),
  status: z.literal("completed"),
  redeemedAt: z.string().datetime(),
});
