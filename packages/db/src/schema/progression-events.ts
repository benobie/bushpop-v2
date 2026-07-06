import { pgTable, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { ulid } from "ulid";

/**
 * Phase A of the retention engine (docs/BRIEF-retention-engine.md §4) — an
 * append-only capture of progression-relevant domain facts. No XP/streak/quest
 * logic reads or writes here yet; that's Phase B's consumer. Rows are written
 * from `dispatchEvent()` (lib/events.ts) via a small name-mapping table, never
 * from route handlers directly, so this table can be replayed from zero to
 * backfill history once the Phase B consumer ships.
 */
export const progressionEvents = pgTable("progression_events", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  // listing.published | listing.sold | listing.removed | listing.relisted | order.completed | item.saved | user.followed
  eventName: varchar("event_name", { length: 50 }).notNull(),
  // The user this event should be credited to (seller for listing.*, buyer for order.completed/item.saved).
  // Nullable — some source events (e.g. system-cascaded status changes) carry no actor.
  userId: varchar("user_id", { length: 26 }),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: varchar("entity_id", { length: 26 }),
  // marketplace_events.id this row was derived from, for traceability. No FK —
  // marketplace_events may be pruned independently of this append-only log.
  sourceEventId: varchar("source_event_id", { length: 26 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("progression_events_user_created_idx").on(table.userId, table.createdAt),
  index("progression_events_event_name_idx").on(table.eventName),
]);
