import { z } from "zod";
import { ulidSchema } from "./common.js";

export const EVENT_CATEGORIES = [
  "auth",
  "user",
  "listing",
  "inventory",
  "order",
  "payment",
  "shipping",
  "dispute",
  "admin",
  "system",
] as const;

export const eventCategorySchema = z.enum(EVENT_CATEGORIES);

export type EventCategory = z.infer<typeof eventCategorySchema>;

export const DELIVERY_STATUSES = ["pending", "dispatched", "failed"] as const;

export const deliveryStatusSchema = z.enum(DELIVERY_STATUSES);

export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export const marketplaceEventSchema = z.object({
  id: ulidSchema,
  eventName: z.string().min(1),
  category: eventCategorySchema,
  actorId: ulidSchema.nullable(),
  entityType: z.string().nullable(),
  entityId: ulidSchema.nullable(),
  channelId: ulidSchema.nullable(),
  metadata: z.record(z.unknown()).nullable(),
  deliveryStatus: deliveryStatusSchema,
  createdAt: z.coerce.date(),
});

export type MarketplaceEvent = z.infer<typeof marketplaceEventSchema>;

export const dispatchEventSchema = z.object({
  eventName: z.string().min(1),
  category: eventCategorySchema,
  actorId: ulidSchema.optional(),
  entityType: z.string().optional(),
  entityId: ulidSchema.optional(),
  channelId: ulidSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type DispatchEventInput = z.infer<typeof dispatchEventSchema>;
