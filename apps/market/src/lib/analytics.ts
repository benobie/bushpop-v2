/**
 * Typed event registry for PostHog. (FM-3)
 *
 * All events MUST be defined here. Direct `posthog.capture()` calls outside
 * this module are banned via ESLint rule (added in Sprint 1).
 *
 * PII scrubbing: the `track()` helper strips email, name, phone, and address
 * fields from all event properties automatically.
 *
 * The shared event taxonomy still includes `channel`; in this fork it always
 * resolves to the single Bushpop channel.
 */

import posthog from "posthog-js";

export type BushpopEvent =
  | { event: "wizard.started"; props: { channel: string; resumed: boolean } }
  | {
      event: "wizard.photos_uploaded";
      props: { channel: string; photo_count: number };
    }
  | {
      event: "wizard.step_completed";
      props: { channel: string; step: number; ms: number };
    }
  | { event: "wizard.ai_draft_generated"; props: { channel: string } }
  | {
      event: "wizard.ai_draft_kept";
      props: { channel: string; field: string };
    }
  | {
      event: "wizard.ai_draft_edited";
      props: { channel: string; field: string };
    }
  | {
      event: "wizard.published";
      props: {
        channel: string;
        listing_id: string;
        strength: number;
        time_to_list_ms: number;
        photo_count: number;
        ai_used: boolean;
      };
    }
  | {
      event: "pdp.view";
      props: { channel: string; listing_id: string; category: string | null };
    }
  | {
      event: "browse.filter_applied";
      props: { channel: string; filter: string; value: string };
    }
  | {
      event: "cart.add";
      props: { channel: string; listing_id: string; price_cents: number };
    }
  | {
      event: "checkout.step";
      props: { channel: string; step: string };
    }
  | {
      event: "order.confirmed";
      props: { channel: string; order_id: string };
    }
  | {
      event: "listing.edited";
      props: { channel: string; listing_id: string };
    }
  | {
      event: "listing.delisted";
      props: { channel: string; listing_id: string };
    }
  | {
      event: "listing.relisted";
      props: { channel: string; listing_id: string };
    }
  | {
      event: "listing.marked_sold";
      props: { channel: string; listing_id: string };
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
 * by the BushpopEvent union.
 */
export function track({ event, props }: BushpopEvent): void {
  posthog.capture(event, scrubPii(props as Record<string, unknown>));
}
