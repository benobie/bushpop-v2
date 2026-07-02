/**
 * Module-scope Stripe.js promise — loaded once per page lifecycle.
 * Import this from client components that need stripe.confirmPayment().
 *
 * NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is inlined at build time by Next.js
 * (NEXT_PUBLIC_ prefix — no next.config.ts env allowlist needed).
 */
import { loadStripe } from "@stripe/stripe-js";

export const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);
