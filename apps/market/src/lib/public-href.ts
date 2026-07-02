/**
 * Strips the internal [channel] segment from paths. (FM-13)
 *
 * The [channel] rewrite is an internal implementation detail — it must never
 * leak into user-facing URLs. All <Link> and router.push() calls must use
 * publicHref() or static paths.
 *
 * Input:  /piklo/search?q=dress   → /search?q=dress
 * Input:  /bushpop/listing/abc    → /listing/abc
 * Input:  /search                 → /search (no-op)
 */
export function publicHref(internalPath: string, channel: string): string {
  return internalPath.replace(new RegExp(`^/${channel}`), "") || "/";
}
