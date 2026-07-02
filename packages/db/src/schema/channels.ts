import { pgTable, varchar, integer, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { ulid } from "ulid";

export const channels = pgTable("channels", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  domain: varchar("domain", { length: 255 }),
  platformFeeBps: integer("platform_fee_bps").notNull().default(800),
  currency: varchar("currency", { length: 3 }).notNull().default("AUD"),
  shippingProvider: varchar("shipping_provider", { length: 50 }),
  supportEmail: varchar("support_email", { length: 255 }),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  theme: jsonb("theme"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
});
