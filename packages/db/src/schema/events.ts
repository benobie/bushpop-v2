import { pgTable, varchar, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { ulid } from "ulid";

export const marketplaceEvents = pgTable("marketplace_events", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  eventName: varchar("event_name", { length: 100 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  actorId: varchar("actor_id", { length: 26 }),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: varchar("entity_id", { length: 26 }),
  channelId: varchar("channel_id", { length: 26 }),
  metadata: jsonb("metadata"),
  deliveryStatus: varchar("delivery_status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
