import { db } from "@bushpop/db/client";
import { sellerProfiles } from "@bushpop/db/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "../../../../lib/stripe.js";
import { NotFoundError, AppError } from "../../../../lib/errors.js";
import type { StripeStatusResponse } from "./schemas.js";

/**
 * Get the seller profile for a user, throwing if not found.
 */
async function getSellerProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, userId))
    .limit(1);

  if (!profile) {
    throw new NotFoundError("Seller profile not found");
  }

  return profile;
}

/**
 * Create a Stripe Connect account for a seller and persist the account ID.
 * Idempotent — if the seller already has an account, returns it.
 */
export async function createConnectAccount(userId: string): Promise<{ stripeAccountId: string }> {
  const profile = await getSellerProfile(userId);

  if (profile.stripeAccountId) {
    return { stripeAccountId: profile.stripeAccountId };
  }

  const stripe = getStripe();

  const account = await stripe.accounts.create({
    type: "express",
    country: "AU",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      seller_profile_id: profile.id,
      user_id: userId,
    },
  });

  await db
    .update(sellerProfiles)
    .set({
      stripeAccountId: account.id,
      stripeOnboardingStatus: "pending",
    })
    .where(eq(sellerProfiles.userId, userId));

  return { stripeAccountId: account.id };
}

/**
 * Get a Stripe Connect onboarding link for the seller.
 * Creates the Connect account first if it doesn't exist.
 */
export async function getOnboardingLink(
  userId: string,
  returnUrl: string,
  refreshUrl: string,
): Promise<{ url: string }> {
  const { stripeAccountId } = await createConnectAccount(userId);
  const stripe = getStripe();

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: "account_onboarding",
  });

  return { url: accountLink.url };
}

/**
 * Sync seller_profiles stripe fields from a Stripe account.updated webhook event.
 */
export async function syncAccountFromWebhook(stripeAccountId: string, account: {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}): Promise<void> {
  const [profile] = await db
    .select({ id: sellerProfiles.id })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.stripeAccountId, stripeAccountId))
    .limit(1);

  if (!profile) {
    // No matching seller — skip (account may not be ours)
    return;
  }

  const onboardingStatus = account.details_submitted ? "complete" : "pending";

  await db
    .update(sellerProfiles)
    .set({
      stripeChargesEnabled: account.charges_enabled,
      stripePayoutsEnabled: account.payouts_enabled,
      stripeOnboardingStatus: onboardingStatus,
    })
    .where(eq(sellerProfiles.stripeAccountId, stripeAccountId));
}

/**
 * Refresh seller stripe status by calling Stripe API synchronously.
 * Used by the Connect return URL to handle the race where account.updated
 * webhook hasn't arrived yet when the seller is redirected back.
 */
export async function refreshAccountStatus(userId: string): Promise<StripeStatusResponse> {
  const profile = await getSellerProfile(userId);

  if (!profile.stripeAccountId) {
    throw new AppError("No Stripe account linked", 422, "NO_STRIPE_ACCOUNT");
  }

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(profile.stripeAccountId);

  const onboardingStatus = account.details_submitted ? "complete" : "pending";

  await db
    .update(sellerProfiles)
    .set({
      stripeChargesEnabled: account.charges_enabled,
      stripePayoutsEnabled: account.payouts_enabled,
      stripeOnboardingStatus: onboardingStatus,
    })
    .where(eq(sellerProfiles.userId, userId));

  return {
    stripeAccountId: profile.stripeAccountId,
    stripeOnboardingStatus: onboardingStatus,
    stripeChargesEnabled: account.charges_enabled,
    stripePayoutsEnabled: account.payouts_enabled,
    onboardingComplete: account.details_submitted && account.charges_enabled,
  };
}

/**
 * Get the current Stripe onboarding status for a seller.
 */
export async function getSellerStripeStatus(userId: string): Promise<StripeStatusResponse> {
  const profile = await getSellerProfile(userId);

  return {
    stripeAccountId: profile.stripeAccountId ?? null,
    stripeOnboardingStatus: profile.stripeOnboardingStatus ?? null,
    stripeChargesEnabled: profile.stripeChargesEnabled,
    stripePayoutsEnabled: profile.stripePayoutsEnabled,
    onboardingComplete:
      profile.stripeOnboardingStatus === "complete" && profile.stripeChargesEnabled,
  };
}
