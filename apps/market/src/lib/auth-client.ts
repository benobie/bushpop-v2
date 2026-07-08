/**
 * Better Auth client initialisation.
 * Requests still go same-origin via the /api proxy (LB-2) — only the
 * baseURL passed to the client must be absolute, since better-auth's
 * client validates it with `new URL(...)`, which throws on a bare path.
 *
 * During SSR there's no window, so fall back to WEB_URL.
 */

import { createAuthClient } from "better-auth/react";

const baseURL =
  typeof window === "undefined"
    ? `${process.env.WEB_URL ?? "http://localhost:3000"}/api/auth`
    : `${window.location.origin}/api/auth`;

export const authClient = createAuthClient({
  baseURL,
  // The /api proxy (proxy.ts, FM-17) rejects any non-GET /api/* request that
  // lacks this header as CSRF. better-auth's client doesn't set it by default,
  // so every sign-in/sign-up/sign-out POST 403'd — send it on all auth requests.
  fetchOptions: {
    headers: { "x-requested-with": "XMLHttpRequest" },
  },
});

export const { signIn, signUp, signOut, useSession } = authClient;
