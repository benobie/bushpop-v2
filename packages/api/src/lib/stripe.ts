import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
      apiVersion: "2026-03-25.dahlia",
    });
  }
  return stripe;
}

/**
 * Reset the singleton — for testing only.
 */
export function _resetStripe(): void {
  stripe = null;
}
