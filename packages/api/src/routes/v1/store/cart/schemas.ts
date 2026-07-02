import { z } from "zod";

// ── Request schemas ──

export const addToCartSchema = z.object({
  listingId: z.string().length(26),
});

// ── Response schemas ──

export const cartItemSchema = z.object({
  id: z.string(),
  cartId: z.string(),
  channelListingId: z.string(),
  priceCents: z.number().int(),
  currency: z.string(),
  createdAt: z.coerce.date(),
});

export const cartSchema = z.object({
  id: z.string(),
  buyerId: z.string(),
  channelId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  items: z.array(cartItemSchema),
});
