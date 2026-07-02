import { z } from "zod";

/** ULID: 26-character Crockford Base32 string */
export const ulidSchema = z
  .string()
  .length(26)
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Invalid ULID format");

export type Ulid = z.infer<typeof ulidSchema>;

/** Standard timestamp fields present on most tables */
export const timestampsSchema = z.object({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Timestamps = z.infer<typeof timestampsSchema>;

/** Pagination request params */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

/** Paginated response wrapper */
export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    totalPages: z.number().int(),
  });
