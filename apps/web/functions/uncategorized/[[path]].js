/**
 * Cloudflare Pages Function — returns HTTP 410 Gone for all /uncategorized/* URLs.
 *
 * These are casino-spam backdoor-injected posts from the WordPress era.
 * 410 signals "permanently gone" to Google, which de-indexes faster than 404 or 301.
 *
 * Architecture ref: /projects/Bushpop/docs/architecture-decisions.md §6
 * The _redirects file has 301→/gone as a fallback; this Function takes priority.
 */
export function onRequestGet() {
  return new Response(
    "<!DOCTYPE html><html><head><title>Gone — Bushpop</title></head><body><h1>410 Gone</h1><p>This page has been permanently removed.</p></body></html>",
    {
      status: 410,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}
