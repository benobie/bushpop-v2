import { pgTable, varchar, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { ulid } from "ulid";
import { channelListings } from "./listings";

export const listingScores = pgTable("listing_scores", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  channelListingId: varchar("channel_listing_id", { length: 26 }).notNull().references(() => channelListings.id, { onDelete: "cascade" }),
  score: integer("score").notNull().default(0),
  photoScore: integer("photo_score").notNull().default(0),
  descriptionScore: integer("description_score").notNull().default(0),
  completenessScore: integer("completeness_score").notNull().default(0),
  categoryScore: integer("category_score").notNull().default(0),
  pricingScore: integer("pricing_score"),
  nudgeKey: varchar("nudge_key", { length: 50 }).notNull(),
  scoredFromVersion: integer("scored_from_version").notNull(),
  scoreVersion: varchar("score_version", { length: 20 }).notNull().default("v1"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  unique("listing_scores_channel_listing_id_unique").on(table.channelListingId),
]);
