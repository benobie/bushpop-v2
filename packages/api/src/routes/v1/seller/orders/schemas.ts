import { z } from "zod";
import { orderResponseSchema, listOrdersQuerySchema } from "../../store/orders/schemas.js";

export { listOrdersQuerySchema };

export const sellerOrderResponseSchema = orderResponseSchema.extend({
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
