import { db } from "@bushpop/db/client";
import { progressionEvents } from "@bushpop/db/schema";

/**
 * Retention-engine Phase A (docs/BRIEF-retention-engine.md §4) — capture-only.
 * No XP/streak/quest logic reads this; that's Phase B's consumer, not built
 * yet. This module's only job is mapping the engine's existing marketplace
 * events onto the brief's progression event vocabulary and appending them,
 * so `dispatchEvent()` stays the single choke point ("zero progression logic
 * in route handlers" — brief §4).
 */

export type ProgressionEventName =
  | "listing.published"
  | "listing.sold"
  | "listing.removed"
  | "listing.relisted"
  | "order.completed"
  | "item.saved"
  | "user.followed";

interface SourceEvent {
  eventName: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

interface ProgressionMapping {
  eventName: ProgressionEventName;
  userId?: string;
}

/**
 * Maps an already-dispatched marketplace event onto a progression event, or
 * returns null if the source event isn't progression-relevant.
 *
 * `user.followed` has no mapping — no "follow a user" feature exists in the
 * engine yet (confirmed by search, 05/07/2026). When Phase 2 builds it, add
 * a case here; do not fabricate a call site ahead of the feature.
 */
export function mapToProgressionEvent(source: SourceEvent): ProgressionMapping | null {
  switch (source.eventName) {
    case "channel_listing.published":
      return { eventName: "listing.published", userId: source.actorId };
    case "channel_listing.archived":
      return { eventName: "listing.removed", userId: source.actorId };
    case "channel_listing.status_changed":
      // Cascaded sold transitions (lib/inventory-invariants.ts) carry no
      // actorId — Phase B resolves the seller via entityId (channel_listing
      // id) → inventory_items.owner_id at consume/backfill time.
      if (source.metadata?.to === "sold") {
        return { eventName: "listing.sold", userId: source.actorId };
      }
      const trigger = typeof source.metadata?.trigger === "string" ? source.metadata.trigger : null;
      // Seller-initiated delist (active → paused) reuses "listing.removed" —
      // same retention signal as archive (listing no longer visible to
      // buyers), just not permanent.
      if (
        source.metadata?.from === "active" &&
        source.metadata?.to === "paused" &&
        trigger === null
      ) {
        return { eventName: "listing.removed", userId: source.actorId };
      }
      if (
        source.metadata?.from === "paused" &&
        source.metadata?.to === "active" &&
        trigger === null
      ) {
        return { eventName: "listing.relisted", userId: source.actorId };
      }
      return null;
    case "order.created":
      return { eventName: "order.completed", userId: source.actorId };
    case "item.saved":
      return { eventName: "item.saved", userId: source.actorId };
    default:
      return null;
  }
}

/**
 * Called from `dispatchEvent()` after a marketplace event is durably written.
 * Best-effort: never throws, mirrors the try/catch-and-log pattern the rest
 * of the event pipeline already uses.
 */
export async function recordProgressionEvent(
  sourceEventId: string,
  source: SourceEvent,
): Promise<void> {
  const mapping = mapToProgressionEvent(source);
  if (!mapping) return;

  try {
    await db.insert(progressionEvents).values({
      eventName: mapping.eventName,
      userId: mapping.userId ?? null,
      entityType: source.entityType ?? null,
      entityId: source.entityId ?? null,
      sourceEventId,
      metadata: source.metadata ? { ...source.metadata, sourceEvent: source.eventName } : { sourceEvent: source.eventName },
    });
  } catch (err) {
    console.error(`[progression-events] Failed to record ${mapping.eventName} from ${source.eventName}:`, err);
  }
}
