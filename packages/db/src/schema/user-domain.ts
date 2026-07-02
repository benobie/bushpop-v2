import { pgTable, varchar, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { ulid } from "ulid";
import { user } from "./auth";

export const userRoles = pgTable("user_roles", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  userId: varchar("user_id", { length: 26 }).notNull().references(() => user.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("user_roles_user_role_unique").on(table.userId, table.role),
]);

export const addresses = pgTable("addresses", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  userId: varchar("user_id", { length: 26 }).notNull().references(() => user.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 50 }),
  line1: varchar("line_1", { length: 255 }).notNull(),
  line2: varchar("line_2", { length: 255 }),
  suburb: varchar("suburb", { length: 100 }).notNull(),
  state: varchar("state", { length: 50 }).notNull(),
  postcode: varchar("postcode", { length: 10 }).notNull(),
  country: varchar("country", { length: 2 }).notNull().default("AU"),
  isDefault: boolean("is_default").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
});

export const sellerProfiles = pgTable("seller_profiles", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  userId: varchar("user_id", { length: 26 }).notNull().references(() => user.id, { onDelete: "cascade" }).unique(),
  storeName: varchar("store_name", { length: 100 }).notNull(),
  handle: varchar("handle", { length: 50 }).notNull().unique(),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  stripeAccountId: varchar("stripe_account_id", { length: 255 }),
  stripeChargesEnabled: boolean("stripe_charges_enabled").notNull().default(false),
  stripePayoutsEnabled: boolean("stripe_payouts_enabled").notNull().default(false),
  stripeOnboardingStatus: varchar("stripe_onboarding_status", { length: 50 }),
  vacationMode: boolean("vacation_mode").notNull().default(false),
  // Default ship-from address — required for listing activation (Phase 2A)
  defaultShippingAddressId: varchar("default_shipping_address_id", { length: 26 }).references(() => addresses.id, { onDelete: "set null" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
});
