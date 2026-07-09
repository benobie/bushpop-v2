import crypto from "node:crypto";

/**
 * BF-08 guest commerce — lets a guest reach their own order confirmation
 * (from the order-confirmation email, or after their anonymous session
 * cookie is gone) without an account. Same technique as
 * pickup-code-service.ts's deriveCode: a secret-keyed HMAC over
 * (orderId, buyerId, exp), recomputed on every request rather than
 * persisted — there's no table, no rotation, nothing to leak. The HMAC
 * output space is large enough that this needs no salt/lockout the way a
 * 6-digit pickup code does; it's a capability token, not something meant to
 * be guessed. The expiry travels inside the token (money-path audit M2,
 * 08/07/2026) rather than in a lookup table, so it has to be part of the
 * signed payload — that also means tampering with it invalidates the
 * signature, since the attacker can't re-sign a bumped expiry.
 */
const GUEST_ORDER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getGuestOrderTokenSecret(): string {
  const secret = process.env.GUEST_ORDER_TOKEN_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("GUEST_ORDER_TOKEN_SECRET must be set in production.");
  }
  // Dev/test only — never reachable in production (guard above).
  return "dev-only-guest-order-token-secret-do-not-use-in-prod";
}

function signGuestOrderPayload(payload: string): string {
  const hmac = crypto.createHmac("sha256", getGuestOrderTokenSecret());
  hmac.update(payload);
  return hmac.digest("base64url");
}

export function deriveGuestOrderToken(
  orderId: string,
  buyerId: string,
  expiresAt: number = Date.now() + GUEST_ORDER_TOKEN_TTL_MS,
): string {
  const exp = Math.floor(expiresAt / 1000);
  const signature = signGuestOrderPayload(`${orderId}:${buyerId}:${exp}`);
  return `${exp.toString(36)}.${signature}`;
}

export function verifyGuestOrderToken(orderId: string, buyerId: string, submitted: string): boolean {
  const separatorIndex = submitted.lastIndexOf(".");
  if (separatorIndex === -1) return false;

  const exp = Number.parseInt(submitted.slice(0, separatorIndex), 36);
  if (!Number.isSafeInteger(exp)) return false;

  const expected = signGuestOrderPayload(`${orderId}:${buyerId}:${exp}`);
  const expectedBuf = Buffer.from(expected);
  const submittedBuf = Buffer.from(submitted.slice(separatorIndex + 1));
  const signatureMatches =
    expectedBuf.length === submittedBuf.length && crypto.timingSafeEqual(expectedBuf, submittedBuf);
  if (!signatureMatches) return false;

  return Date.now() <= exp * 1000;
}
