import { db } from "@bushpop/db/client";
import { sellerProfiles } from "@bushpop/db/schema";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";

/**
 * Set stripe fields directly on seller_profiles without making any Stripe API calls.
 * Used to set up "Stripe-ready" sellers in tests.
 */
export async function createStripeReadySeller(
  userId: string,
  overrides?: {
    stripeAccountId?: string;
    stripeChargesEnabled?: boolean;
    stripePayoutsEnabled?: boolean;
    stripeOnboardingStatus?: string;
  },
) {
  const stripeAccountId = overrides?.stripeAccountId ?? `acct_test_${ulid().toLowerCase()}`;

  const [updated] = await db
    .update(sellerProfiles)
    .set({
      stripeAccountId,
      stripeChargesEnabled: overrides?.stripeChargesEnabled ?? true,
      stripePayoutsEnabled: overrides?.stripePayoutsEnabled ?? true,
      stripeOnboardingStatus: overrides?.stripeOnboardingStatus ?? "complete",
    })
    .where(eq(sellerProfiles.userId, userId))
    .returning();

  return updated!;
}

