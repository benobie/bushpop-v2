import { pgTable, varchar, text, integer, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { ulid } from "ulid";

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  key: varchar("key", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 26 }).notNull(),
  operation: varchar("operation", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("processing"),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("idempotency_keys_key_user_op_unique").on(table.key, table.userId, table.operation),
]);

export const processedWebhookEvents = pgTable("processed_webhook_events", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  provider: varchar("provider", { length: 50 }).notNull(),
  eventId: varchar("event_id", { length: 255 }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("processed_webhook_events_provider_event_unique").on(table.provider, table.eventId),
]);

export const webhookDeadLetters = pgTable("webhook_dead_letters", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  source: varchar("source", { length: 50 }).notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  payload: jsonb("payload").notNull(),
  errorMessage: text("error_message"),
  retries: integer("retries").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
});
