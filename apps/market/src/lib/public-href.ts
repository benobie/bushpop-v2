/**
 * Returns the public path shown to users.
 *
 * In the single-tenant app there is no internal channel prefix to strip, so
 * this is now an identity helper kept for call-site compatibility.
 */
export function publicHref(internalPath: string, _channel?: string): string {
  return internalPath || "/";
}
