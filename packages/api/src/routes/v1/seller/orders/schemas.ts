import { z } from "zod";
import { orderResponseSchema, listOrdersQuerySchema } from "../../store/orders/schemas.js";

export { orderResponseSchema, listOrdersQuerySchema };

export const markShippedBodySchema = z.object({
  trackingNumber: z.string().min(1),
  carrier: z.string().min(1),
});
