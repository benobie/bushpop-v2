/**
 * Better Auth client initialisation.
 * Uses relative /api path via same-origin proxy. (LB-2)
 *
 * During SSR, relative URLs aren't valid — use the full WEB_URL.
 * On the client, relative /api/auth works via the same-origin proxy.
 */

import { createAuthClient } from "better-auth/react";

const baseURL =
  typeof window === "undefined"
    ? `${process.env.WEB_URL ?? "http://localhost:3000"}/api/auth`
    : "/api/auth";

export const authClient = createAuthClient({
  baseURL,
});

export const { signIn, signUp, signOut, useSession } = authClient;
