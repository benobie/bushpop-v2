/**
 * Typed event registry for PostHog. (FM-3)
 *
 * All events MUST be defined here. Direct `posthog.capture()` calls outside
 * this module are banned via ESLint rule (added in Sprint 1).
 *
 * PII scrubbing: the `track()` helper strips email, name, phone, and address
 * fields from all event properties automatically.
 */

import posthog from "posthog-js";

export type PikloEvent =
  | { event: "wizard.started"; props: { channel: string } }
  | {
      event: "wizard.photos_uploaded";
      props: { channel: string; photo_count: number };
    }
  | {
      event: "wizard.published";
      props: { channel: string; listing_id: string };
    }
  | {
      event: "listing.viewed";
      props: { channel: string; listing_id: string; category: string };
    }
  | { event: "checkout.started"; props: { channel: string; item_price: number } }
  | {
      event: "checkout.completed";
      props: { channel: string; order_id: string };
    };

const PII_KEYS = new Set([
  "email",
  "name",
  "phone",
  "address",
  "first_name",
  "last_name",
  "full_name",
]);

function scrubPii<T extends Record<string, unknown>>(props: T): Partial<T> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (PII_KEYS.has(key.toLowerCase())) continue;
    clean[key] = value;
  }
  return clean as Partial<T>;
}

/**
 * Emit a typed PostHog event. The event name and payload shape are enforced
 * by the PikloEvent union.
 */
export function track({ event, props }: PikloEvent): void {
  posthog.capture(event, scrubPii(props as Record<string, unknown>));
}
