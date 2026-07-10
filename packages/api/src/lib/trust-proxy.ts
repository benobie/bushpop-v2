/**
 * Proxy awareness for client-IP resolution.
 *
 * The API runs behind Caddy on staging/production (Caddy → published container
 * port). Caddy *appends* the real client IP to `X-Forwarded-For`, so without
 * `trustProxy` Fastify reports the docker gateway address for every request and
 * every IP-keyed rate limit (notably the 10 req/min gate on `/api/auth/*`)
 * collapses into a single shared bucket for all users.
 *
 * `TRUST_PROXY` accepts:
 *   unset / "" / "false" / "off" / "0"  → trust nothing (dev default)
 *   "1", "2", …                         → hop count: take the Nth address from
 *                                         the right of X-Forwarded-For
 *   "10.0.0.0/8,172.16.0.0/12"          → trusted addresses/CIDRs, passed to Fastify
 *
 * `"true"` is deliberately rejected. It makes Fastify take the left-most
 * X-Forwarded-For entry, which any client can set — turning a rate-limit key
 * into attacker-controlled input.
 */

/**
 * Header the auth proxy stamps with Fastify's resolved `request.ip` before
 * handing the request to better-auth, so better-auth's own IP-derived logic
 * agrees with the trust-proxy configuration above rather than reading raw,
 * client-settable forwarding headers itself.
 */
export const CLIENT_IP_HEADER = "x-bushpop-client-ip";

export type TrustProxyOption = boolean | number | string;

export function parseTrustProxy(raw: string | undefined): TrustProxyOption {
  const value = raw?.trim();
  if (!value) return false;

  const lowered = value.toLowerCase();
  if (lowered === "false" || lowered === "off" || lowered === "0") return false;

  if (lowered === "true") {
    throw new Error(
      'TRUST_PROXY="true" is not allowed: it trusts the left-most X-Forwarded-For ' +
        "entry, which any client can spoof. Set the proxy hop count (e.g. TRUST_PROXY=1) " +
        "or a comma-separated list of trusted addresses/CIDRs instead.",
    );
  }

  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (hops < 1) return false;
    return hops;
  }

  // Comma-separated addresses/CIDRs — Fastify (via proxy-addr) parses these.
  return value;
}
