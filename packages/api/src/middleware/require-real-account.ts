import type { FastifyRequest, FastifyReply } from "fastify";
import { UnauthorisedError } from "../lib/errors.js";

/**
 * Require a real, non-anonymous account.
 *
 * `requireAuth` only checks that a session exists. Since BF-08 guest commerce,
 * touching the cart once bootstraps a real session backed by an anonymous user
 * row — which is exactly the intended design for cart, checkout, addresses and
 * buyer orders, all of which are additionally scoped by the session's own
 * buyerId.
 *
 * It is NOT the intended design for features that assume an account:
 *
 * - Wishlist and saved searches. The frontend expects a 401 here and redirects
 *   to sign-in (see `fav-button.tsx`); without this guard a guest silently
 *   accumulates favourites against a throwaway identity they can never recover.
 * - Listing reports, whose per-reporter daily cap is only meaningful if minting
 *   a new reporter identity is not free. Anonymous sessions make it free, so one
 *   actor can exceed the cap system-wide and flood the moderation queue.
 *
 * Must be registered AFTER `requireAuth` in the same preHandler array — it reads
 * `request.user`, which `requireAuth` populates.
 */
export async function requireRealAccount(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user || request.user.isAnonymous === true) {
    throw new UnauthorisedError("This feature requires an account. Please sign in or sign up.");
  }
}
