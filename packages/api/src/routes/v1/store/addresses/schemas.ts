import { z } from "zod";

// ── Request schemas ──

export const createAddressSchema = z.object({
  label: z.string().max(50).optional(),
  line1: z.string().min(1).max(255),
  line2: z.string().max(255).optional(),
  suburb: z.string().min(1).max(100),
  state: z.string().min(1).max(50),
  postcode: z.string().min(1).max(10),
  country: z.string().length(2).default("AU"),
  isDefault: z.boolean().default(false),
});

export const updateAddressSchema = createAddressSchema.partial();

// ── Response schema ──

export const addressResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  label: z.string().nullable(),
  line1: z.string(),
  line2: z.string().nullable(),
  suburb: z.string(),
  state: z.string(),
  postcode: z.string(),
  country: z.string(),
  isDefault: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
