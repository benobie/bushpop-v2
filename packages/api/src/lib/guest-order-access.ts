import crypto from "node:crypto";

/**
 * BF-08 guest commerce — lets a guest reach their own order confirmation
 * (from the order-confirmation email, or after their anonymous session
 * cookie is gone) without an account. Same technique as
 * pickup-code-service.ts's deriveCode: a secret-keyed HMAC over
 * (orderId, buyerId), recomputed on every request rather than persisted —
 * there's no table, no rotation, nothing to leak. The HMAC output space is
 * large enough that this needs no salt/lockout the way a 6-digit pickup
 * code does; it's a capability token, not something meant to be guessed.
 */
function getGuestOrderTokenSecret(): string {
  const secret = process.env.GUEST_ORDER_TOKEN_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("GUEST_ORDER_TOKEN_SECRET must be set in production.");
  }
  // Dev/test only — never reachable in production (guard above).
  return "dev-only-guest-order-token-secret-do-not-use-in-prod";
}

export function deriveGuestOrderToken(orderId: string, buyerId: string): string {
  const hmac = crypto.createHmac("sha256", getGuestOrderTokenSecret());
  hmac.update(`${orderId}:${buyerId}`);
  return hmac.digest("base64url");
}

export function verifyGuestOrderToken(orderId: string, buyerId: string, submitted: string): boolean {
  const expected = deriveGuestOrderToken(orderId, buyerId);
  const expectedBuf = Buffer.from(expected);
  const submittedBuf = Buffer.from(submitted);
  if (expectedBuf.length !== submittedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, submittedBuf);
}
