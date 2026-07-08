/**
 * Next.js proxy (formerly middleware.ts — renamed in Next.js 16) — handles three concerns:
 * 1. CSRF protection: X-Requested-With check on /api/* state-changing requests (FM-17)
 * 2. Proxy header forwarding: X-Forwarded-For for backend rate limiting (FM-19)
 * 3. Optimistic auth guard: redirect to /sign-in if no session cookie (FM-1 — guard only, not trust boundary)
 */

import { NextResponse, type NextRequest } from "next/server";

/**
 * Routes that require authentication (optimistic check only).
 * `/bag` and `/checkout` are deliberately NOT here (BF-08, guest commerce)
 * — a guest with no session at all just gets redirected to /bag (empty cart)
 * by the page itself; anyone who's added to bag already has a real
 * (anonymous) session by the time they reach checkout, so both routes work
 * unmodified after that first add-to-bag.
 */
const PROTECTED_PREFIXES = ["/account", "/dashboard", "/sell", "/orders"];

/**
 * BF-08 guest commerce — the one `/orders/*` page a guest with NO session
 * must be able to reach: their order-confirmation email link. The token in
 * the URL is the ownership proof (verified API-side), not this page's auth
 * state — see guest-order-access.ts.
 */
const GUEST_ORDER_PAGE = /^\/orders\/[^/]+\/guest\/?$/;

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

  // ── 3. Optimistic auth guard (FM-1 — NOT a trust boundary) ──
  const isProtected =
    PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix)) &&
    !GUEST_ORDER_PAGE.test(pathname);
  if (isProtected) {
    const hasSession =
      request.cookies.has("better-auth.session_token") ||
      request.cookies.has("__Secure-better-auth.session_token");
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      return NextResponse.redirect(url);
    }
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
