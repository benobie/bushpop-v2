/**
 * Server-side guard for internal-only pages (the bulk-listing tool).
 *
 * Mirrors requireAuth()'s shape but also checks the `roles` array already
 * returned by /api/v1/customer/me — nothing new server-side, this just
 * reads a field the engine already sends and nobody in apps/market checked
 * yet. Grant the "admin" role to the Bushpop staff account the same way
 * seller role is granted (an `admin` row in user_roles) — there's no admin
 * frontend anywhere else in this monorepo to do it from yet.
 */

import { redirect, unstable_rethrow } from "next/navigation";
import { createAuthedApiClient } from "@bushpop/api-client/server";

export async function requireAdmin() {
  try {
    const api = await createAuthedApiClient();
    const { data, error } = await api.GET("/api/v1/customer/me");
    if (error || !data) redirect("/sign-in");
    if (!data.roles?.includes("admin")) redirect("/");
    return data;
  } catch (err) {
    unstable_rethrow(err);
    redirect("/sign-in");
  }
}
