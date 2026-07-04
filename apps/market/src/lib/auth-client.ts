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
});

export const { signIn, signUp, signOut, useSession } = authClient;
