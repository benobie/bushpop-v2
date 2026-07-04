import { pgTable, varchar, text, integer, boolean, real, numeric, timestamp, index, jsonb, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { user } from "./auth";
import { categories } from "./categories";
import { bulkBatches } from "./bulk-batches";

export const inventoryItems = pgTable("inventory_items", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  ownerId: varchar("owner_id", { length: 26 }).notNull().references(() => user.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  availabilityStatus: varchar("availability_status", { length: 20 }).notNull().default("available"),
  lifecycleState: varchar("lifecycle_state", { length: 20 }).notNull().default("owned"),
  version: integer("version").notNull().default(1),
  brand: varchar("brand", { length: 100 }),
  categoryId: varchar("category_id", { length: 26 }).references(() => categories.id),
  size: varchar("size", { length: 20 }),
  colour: varchar("colour", { length: 30 }),
  material: varchar("material", { length: 50 }),
  era: varchar("era", { length: 50 }),
  fit: varchar("fit", { length: 50 }),
  condition: varchar("condition", { length: 20 }),
  conditionNotes: text("condition_notes"),

  // Sell-flow draft fields (Phase 1). Draft = inventoryItems row (D7);
  // channel_listings is only created at publish, so price/shipping intent
  // lives here while drafting.
  askingPriceCents: integer("asking_price_cents"),
  rrpCents: integer("rrp_cents"),
  sizeScale: varchar("size_scale", { length: 20 }),
  // Shared W4 column contract: nullable jsonb, numeric cm values, key
  // vocabulary superset chest/waist/hip/length/inseam/rise/shoulder/sleeve
  // (+ documented template extensions). Zod-validated at the API edge only.
  measurements: jsonb("measurements").$type<Record<string, number>>(),
  shippingOption: varchar("shipping_option", { length: 20 }),
  parcelSize: varchar("parcel_size", { length: 10 }),

  // AI enrichment output (advisory — canonical fields filled via COALESCE, never overwritten)
  aiTitle: varchar("ai_title", { length: 255 }),
  aiDescription: text("ai_description"),
  aiTags: jsonb("ai_tags").$type<string[]>(),
  aiSuggestedBrand: varchar("ai_suggested_brand", { length: 100 }),
  aiSuggestedCategory: varchar("ai_suggested_category", { length: 100 }),
  aiSuggestedColour: varchar("ai_suggested_colour", { length: 30 }),
  aiSuggestedMaterial: varchar("ai_suggested_material", { length: 50 }),
  aiConfidence: real("ai_confidence"),
  aiPromptVersion: varchar("ai_prompt_version", { length: 20 }),
  aiModel: varchar("ai_model", { length: 50 }),

  // Enrichment operational state
  aiStatus: varchar("ai_status", { length: 20 }).notNull().default("none"),
  aiEnrichedAt: timestamp("ai_enriched_at", { withTimezone: true }),
  aiLastError: text("ai_last_error"),
  aiImageHash: varchar("ai_image_hash", { length: 64 }),

  shippingClass: varchar("shipping_class", { length: 5 }),

  // Internal bulk-listing tool (B2) — nullable tag grouping items created in
  // the same intake session. Null for items created via the normal /sell flow.
  batchId: varchar("batch_id", { length: 26 }).references(() => bulkBatches.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
}, (table) => [
  index("inventory_items_owner_id_idx").on(table.ownerId),
  index("inventory_items_lifecycle_state_idx").on(table.lifecycleState),
  index("inventory_items_category_id_idx").on(table.categoryId),
  index("inventory_items_batch_id_idx").on(table.batchId),
  check("inventory_items_asking_price_cents_check", sql`${table.askingPriceCents} IS NULL OR ${table.askingPriceCents} > 0`),
]);

export const inventoryItemImages = pgTable("inventory_item_images", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  inventoryItemId: varchar("inventory_item_id", { length: 26 }).notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  storageKey: varchar("storage_key", { length: 500 }).notNull(),
  contentType: varchar("content_type", { length: 50 }),
  sizeBytes: integer("size_bytes"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  position: integer("position").notNull().default(0),
  isPrimary: boolean("is_primary").notNull().default(false),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  // Aspect ratio stored on confirm (numerator/denominator as width/height) for CLS prevention (FM-R2-2 + FM-R3-4)
  aspectRatio: numeric("aspect_ratio"),
  // Backfill status for the one-off backfill job (FM-R2-2 + FM-R3-4)
  backfillStatus: varchar("backfill_status", { length: 30 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("inventory_item_images_item_id_idx").on(table.inventoryItemId),
]);
