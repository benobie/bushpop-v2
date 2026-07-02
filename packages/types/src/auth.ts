import { z } from "zod";

export const signupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const signinRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type SigninRequest = z.infer<typeof signinRequestSchema>;

export const authResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    image: z.string().nullable(),
    emailVerified: z.boolean(),
  }),
  session: z.object({
    id: z.string(),
    token: z.string(),
    expiresAt: z.coerce.date(),
  }),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
