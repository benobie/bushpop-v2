import { Worker } from "bullmq";
import { eq, and, isNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@bushpop/db/client";
import { inventoryItems, inventoryItemImages } from "@bushpop/db/schema";
import { categories } from "@bushpop/db/schema";
import { getRedis } from "../lib/redis.js";
import { getClaudeClient } from "../lib/claude.js";
import { createPresignedGetUrl } from "../lib/r2.js";
import { buildEnrichmentRequest, PROMPT_VERSION, ENRICHMENT_MODEL } from "../lib/enrichment-prompt.js";
import {
  parseModelOutput,
  normalizeModelOutput,
  enrichmentOutputSchema,
  type EnrichmentOutput,
} from "../lib/enrichment-schema.js";
import { ENRICHMENT_QUEUE, getEnrichmentQueue } from "../lib/enrichment-queue.js";
import { dispatchEvent } from "../lib/events.js";

export interface EnrichmentJobData {
  inventoryItemId: string;
  ownerId: string;
}

const MAX_IMAGES = 5;

// Category slug → ULID cache (populated on first use)
let categoryCache: Map<string, string> | null = null;

async function getCategoryCache(): Promise<Map<string, string>> {
  if (!categoryCache) {
    const rows = await db
      .select({ id: categories.id, slug: categories.slug })
      .from(categories)
      .where(isNull(categories.parentId));
    categoryCache = new Map(rows.map((r) => [r.slug, r.id]));
  }
  return categoryCache;
}

function computeImageHash(
  images: Array<{ id: string; position: number }>,
): string {
  const payload = images.map((img) => `${img.id}:${img.position}`).join(",");
  return createHash("sha256").update(payload).digest("hex");
}

async function getReadyImages(itemId: string) {
  return db
    .select({
      id: inventoryItemImages.id,
      storageKey: inventoryItemImages.storageKey,
      position: inventoryItemImages.position,
    })
    .from(inventoryItemImages)
    .where(
      and(
        eq(inventoryItemImages.inventoryItemId, itemId),
        eq(inventoryItemImages.status, "ready"),
      ),
    )
    .orderBy(inventoryItemImages.position)
    .limit(MAX_IMAGES);
}

class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

// Variant/thumbnail generation moved to workers/image-variants.ts (Phase 1
// task 3) — enqueued unconditionally from confirmUpload so thumbnails exist
// even when no AI key is configured.

export async function processEnrichmentJob(
  data: EnrichmentJobData,
): Promise<void> {
  const { inventoryItemId } = data;

  // 1. Fetch item
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, inventoryItemId));

  if (!item) return;
  if (
    item.lifecycleState === "archived" ||
    item.lifecycleState === "sold"
  ) {
    return;
  }

  // 2. Fetch ready images, cap at 5
  const images = await getReadyImages(inventoryItemId);
  if (images.length === 0) return;

  // 3. Compute image hash
  const imageHash = computeImageHash(images);

  // 4. Set processing status
  await db
    .update(inventoryItems)
    .set({ aiStatus: "processing", aiImageHash: imageHash })
    .where(eq(inventoryItems.id, inventoryItemId));

  try {
    // 6. Generate presigned GET URLs
    const imageUrls = await Promise.all(
      images.map((img) => createPresignedGetUrl(img.storageKey)),
    );

    // 6. Build context from existing item data
    let categoryHint: string | null = null;
    if (item.categoryId) {
      const cache = await getCategoryCache();
      for (const [slug, id] of cache) {
        if (id === item.categoryId) {
          categoryHint = slug;
          break;
        }
      }
    }

    const request = buildEnrichmentRequest(imageUrls, {
      brand: item.brand,
      condition: item.condition,
      categoryHint,
    });

    // 7. Call Claude
    const client = getClaudeClient();
    const response = await client.messages.create(request);

    // 8. Parse response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new NonRetryableError("No text content in Claude response");
    }

    let parsed: unknown;
    try {
      parsed = parseModelOutput(textBlock.text);
    } catch (err) {
      throw new NonRetryableError(
        `Failed to parse model output: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 9. Normalize and validate
    const normalized = normalizeModelOutput(parsed);
    const result = enrichmentOutputSchema.safeParse(normalized);
    if (!result.success) {
      throw new NonRetryableError(
        `Validation failed: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    }

    const output: EnrichmentOutput = result.data;

    // 10. Stale-write check
    const currentImages = await getReadyImages(inventoryItemId);
    const currentHash = computeImageHash(currentImages);
    if (currentHash !== imageHash) {
      // Images changed during processing — reset and requeue
      await db
        .update(inventoryItems)
        .set({ aiStatus: "none" })
        .where(eq(inventoryItems.id, inventoryItemId));

      await getEnrichmentQueue().add(
        "enrich-item",
        data,
        { jobId: `enrich-${inventoryItemId}`, delay: 30_000 },
      );
      return;
    }

    // 11. Determine canonical fill values
    const skipCanonical = output.confidence < 0.1;

    let lookedUpCategoryUlid: string | null = null;
    if (!skipCanonical && output.suggestedCategory) {
      const cache = await getCategoryCache();
      const mapped = cache.get(output.suggestedCategory);
      if (mapped) {
        lookedUpCategoryUlid = mapped;
      } else {
        console.warn(
          `[enrichment] Category slug "${output.suggestedCategory}" not found in DB — config/seed drift?`,
        );
      }
    }

    // 12. Single atomic UPDATE — ai_* always, canonical via COALESCE/NULLIF
    if (skipCanonical) {
      // Non-fashion: write ai_* only, skip canonical fill
      await db
        .update(inventoryItems)
        .set({
          aiTitle: output.title,
          aiDescription: output.description,
          aiTags: output.tags,
          aiSuggestedCategory: output.suggestedCategory,
          aiSuggestedColour: output.suggestedColour,
          aiSuggestedMaterial: output.suggestedMaterial,
          aiConfidence: output.confidence,
          aiPromptVersion: PROMPT_VERSION,
          aiModel: ENRICHMENT_MODEL,
          aiStatus: "completed",
          aiEnrichedAt: new Date(),
          aiLastError: null,
          aiImageHash: imageHash,
        })
        .where(eq(inventoryItems.id, inventoryItemId));
    } else {
      // Single raw SQL for ai_* + canonical COALESCE/NULLIF in one statement
      await db.execute(sql`
        UPDATE inventory_items SET
          ai_title = ${output.title},
          ai_description = ${output.description},
          ai_tags = ${JSON.stringify(output.tags)}::jsonb,
          ai_suggested_category = ${output.suggestedCategory},
          ai_suggested_colour = ${output.suggestedColour},
          ai_suggested_material = ${output.suggestedMaterial},
          ai_confidence = ${output.confidence},
          ai_prompt_version = ${PROMPT_VERSION},
          ai_model = ${ENRICHMENT_MODEL},
          ai_status = 'completed',
          ai_enriched_at = now(),
          ai_last_error = NULL,
          ai_image_hash = ${imageHash},
          title = COALESCE(NULLIF(title, ''), ${output.title}),
          description = COALESCE(NULLIF(description, ''), ${output.description}),
          category_id = COALESCE(category_id, ${lookedUpCategoryUlid}),
          colour = COALESCE(NULLIF(colour, ''), ${output.suggestedColour}),
          material = COALESCE(NULLIF(material, ''), ${output.suggestedMaterial})
        WHERE id = ${inventoryItemId}
      `);
    }

    // 13. Dispatch event (best-effort — event table acts as outbox)
    await dispatchEvent({
      eventName: "inventory.enriched",
      category: "inventory",
      entityType: "inventory_item",
      entityId: inventoryItemId,
      metadata: {
        promptVersion: PROMPT_VERSION,
        model: ENRICHMENT_MODEL,
        confidence: output.confidence,
      },
    }).catch((err) => {
      console.error("[enrichment] Failed to dispatch event:", err);
    });

    // 14. Dispatch content_changed for all channel listings of this item (best-effort)
    try {
      const { channelListings } = await import("@bushpop/db/schema");
      const { ne } = await import("drizzle-orm");
      const listings = await db
        .update(channelListings)
        .set({
          version: sql`${channelListings.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(channelListings.inventoryItemId, inventoryItemId),
            ne(channelListings.status, "archived"),
          ),
        )
        .returning({ id: channelListings.id, channelId: channelListings.channelId });

      for (const listing of listings) {
        await dispatchEvent({
          eventName: "channel_listing.content_changed",
          category: "listings",
          entityType: "channel_listing",
          entityId: listing.id,
          channelId: listing.channelId,
          metadata: { triggeredBy: "enrichment" },
        }).catch((err) => {
          console.error(`[enrichment] Failed to dispatch content_changed for listing ${listing.id}:`, err);
        });
      }
    } catch (err) {
      console.error("[enrichment] Failed to dispatch content_changed events:", err);
    }
  } catch (err) {
    // Set failed status
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(inventoryItems)
      .set({ aiStatus: "failed", aiLastError: message })
      .where(eq(inventoryItems.id, inventoryItemId));

    if (err instanceof NonRetryableError) {
      // Don't retry — deterministic failure
      console.error(`[enrichment] Non-retryable error for ${inventoryItemId}:`, message);
      return;
    }

    throw err; // Let BullMQ retry
  }
}

export function startEnrichmentWorker(): Worker {
  const connection = getRedis();

  const worker = new Worker<EnrichmentJobData>(
    ENRICHMENT_QUEUE,
    async (job) => processEnrichmentJob(job.data),
    {
      connection,
      concurrency: 2,
      limiter: { max: 10, duration: 60_000 },
    },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[enrichment] Job ${job?.id} failed:`,
      err.message,
    );
  });

  return worker;
}
