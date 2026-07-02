import { sql } from "drizzle-orm";
import { pgTable, varchar, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { ulid } from "ulid";
import { channelListings } from "./listings";
import { user } from "./auth";

export const listingReports = pgTable("listing_reports", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  channelListingId: varchar("channel_listing_id", { length: 26 }).notNull().references(() => channelListings.id, { onDelete: "cascade" }),
  reporterId: varchar("reporter_id", { length: 26 }).notNull().references(() => user.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 50 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  uniqueIndex("listing_reports_active_unique")
    .on(table.reporterId, table.channelListingId)
    .where(sql`${table.status} NOT IN ('dismissed')`),
  index("listing_reports_channel_listing_id_idx").on(table.channelListingId),
  index("listing_reports_status_idx").on(table.status),
  index("listing_reports_reporter_id_idx").on(table.reporterId),
]);
