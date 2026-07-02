import { pgTable, varchar, text, boolean, integer, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { ulid } from "ulid";
import { user } from "./auth";

export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  userId: varchar("user_id", { length: 26 }).notNull().references(() => user.id, { onDelete: "cascade" }),
  channel: varchar("channel", { length: 20 }).notNull().default("email"),
  type: varchar("type", { length: 100 }).notNull(),
  priority: varchar("priority", { length: 20 }).notNull(),
  payload: jsonb("payload").notNull(),
  dedupKey: varchar("dedup_key", { length: 64 }).notNull().unique(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sendingAt: timestamp("sending_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  providerMessageId: varchar("provider_message_id", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  userId: varchar("user_id", { length: 26 }).notNull().references(() => user.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 100 }).notNull(),
  channel: varchar("channel", { length: 20 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  unique("notification_preferences_user_type_channel_unique").on(table.userId, table.type, table.channel),
]);
