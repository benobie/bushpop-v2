import { and, eq, isNull } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { sellerProfiles, addresses } from "@bushpop/db/schema";
import { ValidationError } from "./errors.js";

// ── Types ──

export interface SellerReadiness {
  vacationMode: boolean;
  hasShippingAddress: boolean;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  /** True when the seller can activate listings (no Stripe check). */
  listingActivationReady: boolean;
  /** True when the seller can receive payments at checkout. */
  checkoutReady: boolean;
}

// ── Helpers ──

async function getProfile(sellerId: string) {
  const [profile] = await db
    .select({
      vacationMode: sellerProfiles.vacationMode,
      defaultShippingAddressId: sellerProfiles.defaultShippingAddressId,
      stripeChargesEnabled: sellerProfiles.stripeChargesEnabled,
      stripePayoutsEnabled: sellerProfiles.stripePayoutsEnabled,
    })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, sellerId));

  if (!profile) return null;

  // Treat a soft-deleted default address as effectively null
  let hasValidDefaultAddress = false;
  if (profile.defaultShippingAddressId) {
    const [addr] = await db
      .select({ id: addresses.id })
      .from(addresses)
      .where(
        and(
          eq(addresses.id, profile.defaultShippingAddressId),
          isNull(addresses.deletedAt),
        ),
      );
    hasValidDefaultAddress = !!addr;
  }

  return { ...profile, hasValidDefaultAddress };
}

// ── Public API ──

/**
 * Returns a full readiness snapshot for a seller.
 * Used by seller profile endpoints to surface status to the frontend.
 */
export async function getSellerReadiness(sellerId: string): Promise<SellerReadiness> {
  const profile = await getProfile(sellerId);

  if (!profile) {
    return {
      vacationMode: false,
      hasShippingAddress: false,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      listingActivationReady: false,
      checkoutReady: false,
    };
  }

  const vacationMode = profile.vacationMode;
  const hasShippingAddress = profile.hasValidDefaultAddress;
  const stripeChargesEnabled = profile.stripeChargesEnabled;
  const stripePayoutsEnabled = profile.stripePayoutsEnabled;

  const listingActivationReady = !vacationMode && hasShippingAddress;
  const checkoutReady =
    listingActivationReady && stripeChargesEnabled && stripePayoutsEnabled;

  return {
    vacationMode,
    hasShippingAddress,
    stripeChargesEnabled,
    stripePayoutsEnabled,
    listingActivationReady,
    checkoutReady,
  };
}

/**
 * Tier 1 readiness — required to activate a listing.
 * Checks: vacation_mode = false, default_shipping_address_id IS NOT NULL.
 * Does NOT check Stripe — sellers can list without completing Stripe onboarding.
 * They will be blocked at checkout (Tier 2) until Stripe is ready.
 */
export async function assertListingActivationReady(sellerId: string): Promise<void> {
  const profile = await getProfile(sellerId);

  if (!profile) {
    throw new ValidationError("Seller profile not found");
  }

  if (profile.vacationMode) {
    throw new ValidationError(
      "Cannot activate listing while vacation mode is enabled",
    );
  }

  if (!profile.hasValidDefaultAddress) {
    throw new ValidationError(
      "Cannot activate listing without a default shipping address. Add a ship-from address to your seller profile.",
    );
  }
}

/**
 * Tier 2 readiness — required to initiate checkout.
 * Checks: vacation_mode = false, default_shipping_address_id IS NOT NULL,
 * stripe_charges_enabled = true, stripe_payouts_enabled = true.
 */
export async function assertCheckoutReady(sellerId: string): Promise<void> {
  const profile = await getProfile(sellerId);

  if (!profile) {
    throw new ValidationError("Seller profile not found");
  }

  if (profile.vacationMode) {
    throw new ValidationError(
      "Cannot checkout: seller has vacation mode enabled",
    );
  }

  if (!profile.hasValidDefaultAddress) {
    throw new ValidationError(
      "Cannot checkout: seller does not have a shipping address configured",
    );
  }

  if (!profile.stripeChargesEnabled || !profile.stripePayoutsEnabled) {
    throw new ValidationError(
      "Cannot checkout: seller has not completed Stripe onboarding",
    );
  }
}
