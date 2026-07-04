import { z } from "zod";

// ── Request schemas ──

export const initiateCheckoutBody = z.object({
  shippingAddressId: z.string().min(1, "shippingAddressId is required"),
});

export const checkoutIdParam = z.object({
  id: z.string().length(26, "Invalid checkout session ID"),
});

// ── Response schemas ──

export const totalsSchema = z.object({
  subtotalCents: z.number().int().nonnegative(),
  shippingCents: z.number().int().nonnegative(),
  platformFeeCents: z.number().int().nonnegative(),
  buyerProtectionFeeCents: z.number().int().nonnegative(),
  sellerProceedsCents: z.number().int().nonnegative(),
  totalCents: z.number().int().positive(),
  currency: z.string().length(3),
});

export const checkoutResponseSchema = z.object({
  sessionId: z.string(),
  clientSecret: z.string().nullable(),
  expiresAt: z.date().nullable(),
  status: z.string(),
  totals: totalsSchema,
});

export const checkoutSessionFullSchema = z.object({
  id: z.string(),
  cartId: z.string(),
  buyerId: z.string(),
  channelId: z.string(),
  status: z.string(),
  version: z.number().int().positive(),
  subtotalCents: z.number().int().nonnegative(),
  shippingCents: z.number().int().nonnegative(),
  platformFeeCents: z.number().int().nonnegative(),
  buyerProtectionFeeCents: z.number().int().nonnegative(),
  sellerProceedsCents: z.number().int().nonnegative(),
  totalCents: z.number().int().positive(),
  currency: z.string().length(3),
  stripePaymentIntentId: z.string().nullable(),
  stripeClientSecret: z.string().nullable(),
  shippingAddressId: z.string().nullable(),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const cancelCheckoutResponseSchema = z.object({
  cancelled: z.boolean(),
});

export type InitiateCheckoutBody = z.infer<typeof initiateCheckoutBody>;
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
export type CheckoutSessionFull = z.infer<typeof checkoutSessionFullSchema>;
export type CancelCheckoutResponse = z.infer<typeof cancelCheckoutResponseSchema>;
