import { pgTable, varchar, text, integer, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core";
import { ulid } from "ulid";
import { user } from "./auth";
import { channels } from "./channels";

export const savedSearches = pgTable("saved_searches", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  userId: varchar("user_id", { length: 26 }).notNull().references(() => user.id, { onDelete: "cascade" }),
  channelId: varchar("channel_id", { length: 26 }).notNull().references(() => channels.id),
  name: varchar("name", { length: 100 }),
  query: text("query").notNull(),
  filters: jsonb("filters").notNull().default({}),
  queryHash: varchar("query_hash", { length: 64 }).notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  unique("saved_searches_user_channel_hash_unique").on(table.userId, table.channelId, table.queryHash),
  index("saved_searches_user_id_idx").on(table.userId),
  index("saved_searches_channel_id_idx").on(table.channelId),
]);
