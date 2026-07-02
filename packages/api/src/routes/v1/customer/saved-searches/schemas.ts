import { z } from "zod";

export const createSavedSearchBody = z.object({
  query: z.string().min(1),
  filters: z.record(z.unknown()).default({}),
  channelId: z.string().length(26),
  name: z.string().max(100).optional(),
});

export const savedSearchParams = z.object({
  id: z.string().length(26),
});

export const savedSearchListQuery = z.object({
  channelId: z.string().length(26).optional(),
});

export const savedSearchResponse = z.object({
  id: z.string(),
  name: z.string().nullable(),
  query: z.string(),
  filters: z.record(z.unknown()),
  channelId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const savedSearchListResponse = z.object({
  items: z.array(savedSearchResponse),
});
