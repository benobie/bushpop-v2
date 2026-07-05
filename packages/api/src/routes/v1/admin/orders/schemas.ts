import { z } from "zod";

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
});

export const orderSummarySchema = z.object({
  id: z.string(),
  status: z.string(),
  buyerId: z.string(),
  sellerId: z.string(),
  totalCents: z.number(),
  currency: z.string(),
  trackingNumber: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const orderDetailSchema = orderSummarySchema.extend({
  subtotalCents: z.number(),
  shippingCents: z.number(),
  platformFeeCents: z.number(),
  buyerProtectionFeeCents: z.number(),
  sellerProceedsCents: z.number(),
  trackingCarrier: z.string().nullable(),
  lastTrackingStatus: z.string().nullable(),
  lastTrackingEventAt: z.string().datetime().nullable(),
  deliveryConfirmedAt: z.string().datetime().nullable(),
  slaDeadlineAt: z.string().datetime().nullable(),
  stripePaymentIntentId: z.string().nullable(),
  stripeTransferId: z.string().nullable(),
  buyer: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
  seller: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      channelListingId: z.string(),
      title: z.string().nullable(),
      priceCents: z.number(),
    }),
  ),
  payoutHold: z
    .object({
      id: z.string(),
      status: z.string(),
      amountCents: z.number(),
      transferId: z.string().nullable(),
      releaseAttempts: z.number(),
      failureReason: z.string().nullable(),
    })
    .nullable(),
  refunds: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      amountCents: z.number(),
      reason: z.string().nullable(),
      stripeRefundId: z.string().nullable(),
      createdAt: z.string().datetime(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string(),
      eventName: z.string(),
      actorId: z.string().nullable(),
      metadata: z.unknown().nullable(),
      deliveryStatus: z.string(),
      createdAt: z.string().datetime(),
    }),
  ),
});

export const refundOrderBodySchema = z.object({
  reason: z.string().min(1).max(500).default("admin_refund"),
});
