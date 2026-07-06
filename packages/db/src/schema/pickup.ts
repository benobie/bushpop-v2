import { pgTable, varchar, integer, timestamp, unique, index } from "drizzle-orm/pg-core";
import { ulid } from "ulid";
import { orders } from "./commerce";

/**
 * One row per pickup order. The collection code itself is never stored —
 * it's derived deterministically from `orderId` + `salt` via an HMAC keyed
 * by `PICKUP_CODE_SECRET` (packages/api/src/lib/pickup-code-service.ts).
 * This lets the buyer's code stay visible on demand (recomputed, not
 * re-read from storage) while nothing readable sits in a DB dump. Support
 * "regenerating a lost code" (docs/BRIEF-shipping-performance.md §4) means
 * rotating `salt`, which invalidates the old code.
 */
export const pickupCodes = pgTable("pickup_codes", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  orderId: varchar("order_id", { length: 26 }).notNull().references(() => orders.id),
  salt: varchar("salt", { length: 32 }).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  // Failed seller-side redemption attempts. Locks out at MAX_ATTEMPTS
  // (pickup-code-service.ts) independently of the route's time-window rate
  // limit — defense in depth against a 6-digit brute force.
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("pickup_codes_order_id_unique").on(table.orderId),
  index("pickup_codes_redeemed_at_idx").on(table.redeemedAt),
]);
