import { z } from "zod";
import { ulidSchema, timestampsSchema } from "./common.js";

export const userSchema = z
  .object({
    id: ulidSchema,
    email: z.string().email(),
    name: z.string().min(1).max(100),
    image: z.string().url().nullable(),
    emailVerified: z.boolean(),
  })
  .merge(timestampsSchema);

export type User = z.infer<typeof userSchema>;

/** Public-facing user response (no sensitive fields) */
export const userResponseSchema = userSchema.pick({
  id: true,
  name: true,
  image: true,
});

export type UserResponse = z.infer<typeof userResponseSchema>;
