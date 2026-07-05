import { z } from "zod";

export const addressSnapshotSchema = z.object({
  line1: z.string(),
  line2: z.string().optional(),
  suburb: z.string(),
  state: z.string(),
  postcode: z.string(),
  country: z.string().length(2),
});

export const orderItemResponseSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  channelListingId: z.string(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  createdAt: z.string().datetime(),
  // U1 checkout/confirmation restyle: same "look up fresh" enrichment as the
  // cart response (store/cart/service.ts enrichCartItems) — nulls if the
  // underlying listing/inventory item has since been deleted.
  title: z.string().nullable(),
  coverImage: z.string().nullable(),
  handle: z.string().nullable(),
  size: z.string().nullable(),
  condition: z.string().nullable(),
  brand: z.string().nullable(),
});

export const orderResponseSchema = z.object({
  id: z.string(),
  checkoutSessionId: z.string(),
  buyerId: z.string(),
  sellerId: z.string(),
  channelId: z.string(),
  status: z.enum([
    "paid",
    "shipped",
    "delivered",
    "completed",
    "cancelled",
    // Phase 2B additions
    "delivery_assumed",
    "shipment_stale_review",
    "refund_in_progress",
    "refunded",
  ]),
  subtotalCents: z.number().int().nonnegative(),
  shippingCents: z.number().int().nonnegative(),
  platformFeeCents: z.number().int().nonnegative(),
  buyerProtectionFeeCents: z.number().int().nonnegative(),
  sellerProceedsCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  shippingAddressSnapshot: addressSnapshotSchema.nullable(),
  senderAddressSnapshot: addressSnapshotSchema.nullable(),
  trackingNumber: z.string().nullable(),
  trackingCarrier: z.string().nullable(),
  stripePaymentIntentId: z.string().nullable(),
  items: z.array(orderItemResponseSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const listOrdersQuerySchema = z.object({
  status: z.enum([
    "paid",
    "shipped",
    "delivered",
    "completed",
    "cancelled",
    "delivery_assumed",
    "shipment_stale_review",
    "refund_in_progress",
    "refunded",
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
