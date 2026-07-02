/**
 * Browser-side API client for client components.
 * Uses relative /api path (same-origin proxy). (LB-2)
 * Includes CSRF X-Requested-With header. (FM-17)
 */

import createClient from "openapi-fetch";
import type { paths } from "./schema";

/**
 * Client components — uses relative /api path via same-origin proxy.
 * Cookies are sent automatically by the browser.
 */
export function createBrowserApiClient() {
  return createClient<paths>({
    baseUrl: "",
    headers: {
      "x-requested-with": "XMLHttpRequest",
    },
    credentials: "include",
  });
}
