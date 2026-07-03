import { pgTable, varchar, integer, real, timestamp, index, jsonb, text } from "drizzle-orm/pg-core";
import { ulid } from "ulid";
import { user } from "./auth";
import { inventoryItems } from "./inventory";

/**
 * One row per AI draft-generation attempt (D12/D16).
 *
 * The row id IS the poll jobId (ulid) — status lives in Postgres, not
 * BullMQ. `raw_output` keeps the model's unresolved JSON, `resolved_output`
 * the normalised suggestion actually mirrored into the item's ai* columns,
 * and `outcome` the kept/edited diff computed at publish. Together they are
 * the prompt-tuning dataset.
 */
export const aiGenerations = pgTable("ai_generations", {
  id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => ulid()),
  sellerId: varchar("seller_id", { length: 26 }).notNull().references(() => user.id, { onDelete: "cascade" }),
  inventoryItemId: varchar("inventory_item_id", { length: 26 }).notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  // auto (first details entry) | regenerate (manual button, capped at 3)
  trigger: varchar("trigger", { length: 20 }).notNull(),
  provider: varchar("provider", { length: 20 }).notNull(),
  model: varchar("model", { length: 50 }).notNull(),
  promptVersion: varchar("prompt_version", { length: 20 }).notNull(),
  // pending | completed | failed | filtered
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costUsdMicros: integer("cost_usd_micros"),
  latencyMs: integer("latency_ms"),
  confidence: real("confidence"),
  rawOutput: jsonb("raw_output"),
  resolvedOutput: jsonb("resolved_output"),
  // { kept: string[], edited: string[] } — diffed at publish (D16)
  outcome: jsonb("outcome").$type<{ kept: string[]; edited: string[] }>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("ai_generations_seller_created_idx").on(table.sellerId, table.createdAt),
  index("ai_generations_item_idx").on(table.inventoryItemId),
]);
