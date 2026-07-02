import { pgTable, varchar, timestamp, unique, index } from "drizzle-orm/pg-core";
import { ulid } from "ulid";
import { user } from "./auth";
import { channelListings } from "./listings";

export const wishlists = pgTable("wishlists", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  userId: varchar("user_id", { length: 26 }).notNull().references(() => user.id, { onDelete: "cascade" }),
  channelListingId: varchar("channel_listing_id", { length: 26 }).notNull().references(() => channelListings.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("wishlists_user_listing_unique").on(table.userId, table.channelListingId),
  index("wishlists_user_id_idx").on(table.userId),
  index("wishlists_channel_listing_id_idx").on(table.channelListingId),
]);
