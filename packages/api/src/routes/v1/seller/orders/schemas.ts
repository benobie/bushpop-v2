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
