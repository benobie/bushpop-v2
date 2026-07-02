/**
 * Server-side auth verification for protected RSC layouts/pages. (FM-1)
 *
 * Middleware is an optimistic guard only. Every protected Server Component
 * must call requireAuth() to verify auth via the backend.
 *
 * Uses unstable_rethrow to avoid swallowing Next.js redirect/notFound errors
 * that openapi-fetch's internal try/catch would otherwise eat. (FM-11, OC-2)
 */

import { redirect, unstable_rethrow } from "next/navigation";
import { createAuthedApiClient } from "@bushpop/api-client/server";

export async function requireAuth() {
  try {
    const api = await createAuthedApiClient();
    const { data, error } = await api.GET("/api/v1/customer/me");
    if (error || !data) redirect("/sign-in");
    return data;
  } catch (err) {
    unstable_rethrow(err);
    redirect("/sign-in");
  }
}
