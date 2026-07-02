import { z } from "zod";

export const channelResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  domain: z.string().nullable(),
  platformFeeBps: z.number().int(),
  currency: z.string(),
  supportEmail: z.string().email().nullable(),
  logoUrl: z.string().url().nullable(),
  faviconUrl: z.string().url().nullable(),
  theme: z.record(z.unknown()).nullable(),
  isActive: z.boolean(),
});

export type ChannelResponse = z.infer<typeof channelResponseSchema>;
