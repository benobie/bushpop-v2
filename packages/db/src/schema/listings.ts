import { pgTable, varchar, text, integer, timestamp, unique, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { inventoryItems } from "./inventory";
import { channels } from "./channels";

export const channelListings = pgTable("channel_listings", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  inventoryItemId: varchar("inventory_item_id", { length: 26 }).notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  channelId: varchar("channel_id", { length: 26 }).notNull().references(() => channels.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
  handle: varchar("handle", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  hiddenAt: timestamp("hidden_at"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  unique("channel_listings_item_channel_unique").on(table.inventoryItemId, table.channelId),
  unique("channel_listings_handle_channel_unique").on(table.handle, table.channelId),
  index("channel_listings_status_idx").on(table.status),
  index("channel_listings_channel_id_idx").on(table.channelId),
  check("channel_listings_price_positive", sql`${table.priceCents} > 0`),
]);
