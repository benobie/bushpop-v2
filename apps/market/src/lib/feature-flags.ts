/**
 * Server-only feature flags. Mirrors the env-var-gated route registration
 * pattern in packages/api/src/server.ts (e.g. MULTI_VENDOR_CHECKOUT_ENABLED) —
 * unset or any value other than "true" means off.
 */
export function isModerationQueueEnabled(): boolean {
  return process.env.MODERATION_QUEUE_ENABLED === "true";
}
