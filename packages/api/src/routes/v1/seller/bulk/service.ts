import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { bulkBatches, channelListings, inventoryItems } from "@bushpop/db/schema";
import { NotFoundError, PublishNotReadyError, AppError } from "../../../../lib/errors.js";
import { createDraft, getDraft } from "../drafts/service.js";
import { publishDraft } from "../drafts/publish-service.js";

/**
 * Internal bulk-listing tool (B2) — batch grouping over the EXISTING drafts
 * façade. Every item created/published here is a normal inventory_items row
 * going through normal createDraft()/publishDraft(); this module only adds
 * the batch tag + loops. No parallel publish gate, no forked strength rubric.
 */

type BulkBatchRow = typeof bulkBatches.$inferSelect;

async function findOwnedBatch(batchId: string, ownerId: string): Promise<BulkBatchRow> {
  const [batch] = await db
    .select()
    .from(bulkBatches)
    .where(and(eq(bulkBatches.id, batchId), eq(bulkBatches.ownerId, ownerId)));
  if (!batch) {
    throw new NotFoundError("Batch not found");
  }
  return batch;
}

async function batchCounts(batchId: string): Promise<{ itemCount: number; publishedCount: number }> {
  const [itemRow] = await db
    .select({ count: count() })
    .from(inventoryItems)
    .where(eq(inventoryItems.batchId, batchId));

  const [publishedRow] = await db
    .select({ count: count() })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.batchId, batchId), eq(inventoryItems.lifecycleState, "for_sale")));

  return {
    itemCount: itemRow?.count ?? 0,
    publishedCount: publishedRow?.count ?? 0,
  };
}

function serializeBatch(batch: BulkBatchRow, counts: { itemCount: number; publishedCount: number }) {
  return {
    id: batch.id,
    label: batch.label,
    itemCount: counts.itemCount,
    publishedCount: counts.publishedCount,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  };
}

export async function createBatch(ownerId: string, label?: string) {
  const [batch] = await db
    .insert(bulkBatches)
    .values({ ownerId, label: label ?? null })
    .returning();
  return serializeBatch(batch!, { itemCount: 0, publishedCount: 0 });
}

export async function listBatches(ownerId: string, limit: number) {
  const rows = await db
    .select()
    .from(bulkBatches)
    .where(eq(bulkBatches.ownerId, ownerId))
    .orderBy(desc(bulkBatches.createdAt))
    .limit(limit);

  const batches = [];
  for (const batch of rows) {
    batches.push(serializeBatch(batch, await batchCounts(batch.id)));
  }
  return { batches };
}

export async function createBatchDrafts(batchId: string, ownerId: string, itemCount: number) {
  const batch = await findOwnedBatch(batchId, ownerId);

  const items = [];
  for (let i = 0; i < itemCount; i++) {
    items.push(await createDraft(ownerId, batch.id));
  }

  return { batch: serializeBatch(batch, await batchCounts(batch.id)), items };
}

export async function listBatchItems(batchId: string, ownerId: string) {
  const batch = await findOwnedBatch(batchId, ownerId);

  const rows = await db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(eq(inventoryItems.batchId, batchId))
    .orderBy(inventoryItems.createdAt);

  const items = await Promise.all(rows.map((row) => getDraft(row.id, ownerId)));

  return { batch: serializeBatch(batch, await batchCounts(batch.id)), items };
}

export async function publishBatch(
  batchId: string,
  ownerId: string,
  channelId: string,
  legalAgree: boolean,
) {
  await findOwnedBatch(batchId, ownerId);

  const readyItems = await db
    .select({ id: inventoryItems.id, version: inventoryItems.version })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.batchId, batchId),
        eq(inventoryItems.lifecycleState, "owned"),
      ),
    )
    .orderBy(inventoryItems.createdAt);

  const published: Array<{ itemId: string; listingId: string; handle: string; strengthScore: number }> = [];
  const failed: Array<{ itemId: string; reason: string; missing?: string[] }> = [];

  // Sequential, not Promise.all — this loop is the ONLY caller of
  // publishDraft() here (same gate as /sell, one at a time, one codebase).
  // Sequencing also avoids N concurrent advisory-lock waits inside publish's
  // activation/lifecycle checks for the same seller.
  for (const item of readyItems) {
    try {
      const result = await publishDraft(item.id, ownerId, channelId, {
        version: item.version,
        legalAgree,
      });
      published.push({
        itemId: item.id,
        listingId: result.listingId,
        handle: result.handle,
        strengthScore: result.strength.score,
      });
    } catch (err) {
      if (err instanceof PublishNotReadyError) {
        failed.push({ itemId: item.id, reason: err.message, missing: err.missing });
      } else if (err instanceof AppError) {
        failed.push({ itemId: item.id, reason: err.message });
      } else {
        console.error(`[bulk-publish] Unexpected error publishing ${item.id}:`, err);
        failed.push({ itemId: item.id, reason: "Unexpected error — see server logs" });
      }
    }
  }

  return { published, failed };
}

function csvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

const CSV_COLUMNS = [
  "itemId",
  "listingId",
  "handle",
  "status",
  "title",
  "brand",
  "category",
  "size",
  "colour",
  "condition",
  "priceCents",
  "description",
  "primaryImageUrl",
] as const;

export async function exportBatchCsv(batchId: string, ownerId: string): Promise<string> {
  await findOwnedBatch(batchId, ownerId);

  const rows = await db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(eq(inventoryItems.batchId, batchId))
    .orderBy(inventoryItems.createdAt);

  if (rows.length === 0) {
    return CSV_COLUMNS.join(",") + "\n";
  }

  const itemIds = rows.map((r) => r.id);
  const listingRows = await db
    .select({
      inventoryItemId: channelListings.inventoryItemId,
      listingId: channelListings.id,
      handle: channelListings.handle,
      status: channelListings.status,
    })
    .from(channelListings)
    .where(inArray(channelListings.inventoryItemId, itemIds));
  const listingByItem = new Map(listingRows.map((l) => [l.inventoryItemId, l]));

  const items = await Promise.all(itemIds.map((id) => getDraft(id, ownerId)));

  const lines = [CSV_COLUMNS.join(",")];
  for (const item of items) {
    const listing = listingByItem.get(item.id);
    const primaryImage = item.images.find((img) => img.isPrimary) ?? item.images[0];
    const primaryImageUrl = primaryImage?.url ?? "";
    lines.push(
      [
        csvCell(item.id),
        csvCell(listing?.listingId ?? ""),
        csvCell(listing?.handle ?? ""),
        csvCell(listing?.status ?? item.lifecycleState),
        csvCell(item.title),
        csvCell(item.brand),
        csvCell(item.category?.name ?? ""),
        csvCell(item.size),
        csvCell(item.colour),
        csvCell(item.condition),
        csvCell(item.askingPriceCents),
        csvCell(item.description),
        csvCell(primaryImageUrl),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}
