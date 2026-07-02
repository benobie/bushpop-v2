import { z } from "zod";
import {
  AllocationSummarySchema,
  CheckoutGroupTotalsSchema,
  ChargeTypeSchema,
  OrderGroupStatusSchema,
} from "@bushpop/types";

// ── Request schemas ──

export const createCheckoutGroupBody = z.object({
  shippingAddressId: z.string().min(1, "shippingAddressId is required"),
});

export const checkoutGroupIdParam = z.object({
  id: z.string().length(26, "Invalid order group ID"),
});

// ── Response schemas ──

export const checkoutGroupQuoteResponseSchema = z.object({
  orderGroupId: z.string(),
  clientSecret: z.string(),
  chargeType: ChargeTypeSchema,
  totals: CheckoutGroupTotalsSchema,
  allocations: z.array(AllocationSummarySchema),
  expiresAt: z.date().nullable(),
});

export const checkoutGroupStatusResponseSchema = z.object({
  orderGroupId: z.string(),
  status: OrderGroupStatusSchema,
  chargeType: ChargeTypeSchema,
  totals: CheckoutGroupTotalsSchema,
  allocations: z.array(AllocationSummarySchema),
  expiresAt: z.date().nullable(),
});

export const cancelCheckoutGroupResponseSchema = z.object({
  cancelled: z.boolean(),
});

// ── Inferred types ──

export type CreateCheckoutGroupBody = z.infer<typeof createCheckoutGroupBody>;
export type CheckoutGroupIdParam = z.infer<typeof checkoutGroupIdParam>;
export type CheckoutGroupQuoteResponse = z.infer<typeof checkoutGroupQuoteResponseSchema>;
export type CheckoutGroupStatusResponse = z.infer<typeof checkoutGroupStatusResponseSchema>;
export type CancelCheckoutGroupResponse = z.infer<typeof cancelCheckoutGroupResponseSchema>;
