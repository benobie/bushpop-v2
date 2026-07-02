import { pgTable, varchar, timestamp, unique, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { channels } from "./channels";

export const categories = pgTable("categories", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  channelId: varchar("channel_id", { length: 26 }).references(() => channels.id),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  parentId: varchar("parent_id", { length: 26 }).references((): AnyPgColumn => categories.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  unique("categories_slug_channel_unique").on(table.slug, table.channelId),
  uniqueIndex("categories_slug_global_unique")
    .on(table.slug)
    .where(sql`${table.channelId} IS NULL`),
]);
