import { z } from "zod";

export const stripeStatusResponseSchema = z.object({
  stripeAccountId: z.string().nullable(),
  stripeOnboardingStatus: z.string().nullable(),
  stripeChargesEnabled: z.boolean(),
  stripePayoutsEnabled: z.boolean(),
  onboardingComplete: z.boolean(),
});

export const stripeOnboardResponseSchema = z.object({
  url: z.string().url(),
});

export type StripeStatusResponse = z.infer<typeof stripeStatusResponseSchema>;
export type StripeOnboardResponse = z.infer<typeof stripeOnboardResponseSchema>;
