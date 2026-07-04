import { pgTable, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { ulid } from "ulid";
import { user } from "./auth";

/**
 * A grouping tag for inventory_items created together via the internal bulk
 * listing tool (a photo-intake "session"). Deliberately thin — everything
 * else about an item (photos, AI draft, price, publish state) already lives
 * on inventory_items; this table exists only so the batch UI and CSV export
 * can filter to "items from this run".
 */
export const bulkBatches = pgTable("bulk_batches", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  ownerId: varchar("owner_id", { length: 26 }).notNull().references(() => user.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  index("bulk_batches_owner_created_idx").on(table.ownerId, table.createdAt),
]);
