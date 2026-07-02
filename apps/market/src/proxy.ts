/**
 * Next.js proxy (formerly middleware.ts — renamed in Next.js 16) — handles four concerns:
 * 1. Channel rewrite: hostname → [channel] dynamic route segment (LB-1)
 * 2. CSRF protection: X-Requested-With check on /api/* state-changing requests (FM-17)
 * 3. Optimistic auth guard: redirect to /sign-in if no session cookie (FM-1 — guard only, not trust boundary)
 * 4. Proxy header forwarding: X-Forwarded-For for backend rate limiting (FM-19)
 */

import { NextResponse, type NextRequest } from "next/server";
import { resolveChannelFromHost } from "@bushpop/config";

/** Routes that require authentication (optimistic check only) */
const PROTECTED_PREFIXES = ["/account", "/dashboard", "/sell", "/checkout", "/bag", "/orders"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. CSRF check on /api/* proxy routes (FM-17) ──
  if (pathname.startsWith("/api/") && request.method !== "GET") {
    if (request.headers.get("x-requested-with") !== "XMLHttpRequest") {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  // ── 2. Forward X-Forwarded-For for proxied /api/* requests (FM-19) ──
  // Must mutate the **request** headers via NextResponse.next({ request: { headers } }).
  // Setting headers on the response only changes the reply sent to the client — upstream
  // (the /api route handler → Fastify) never sees them.
  if (pathname.startsWith("/api/")) {
    const requestHeaders = new Headers(request.headers);
    const clientIp =
      requestHeaders.get("x-forwarded-for") ??
      requestHeaders.get("x-real-ip") ??
      "unknown";
    requestHeaders.set("x-forwarded-for", clientIp);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ── 3. Channel rewrite (LB-1) ──
  const channel = resolveChannelFromHost(request.headers.get("host") ?? "");
  const url = request.nextUrl.clone();

  // Don't double-rewrite if already prefixed
  if (!url.pathname.startsWith(`/${channel}`)) {
    // ── 4. Optimistic auth guard (FM-1 — NOT a trust boundary) ──
    const isProtected = PROTECTED_PREFIXES.some((prefix) =>
      pathname.startsWith(prefix),
    );
    if (isProtected) {
      const hasSession =
        request.cookies.has("better-auth.session_token") ||
        request.cookies.has("__Secure-better-auth.session_token");
      if (!hasSession) {
        url.pathname = `/${channel}/sign-in`;
        return NextResponse.redirect(url);
      }
    }

    url.pathname = `/${channel}${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
