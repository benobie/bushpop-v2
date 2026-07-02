import { and, count, eq, gte, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { AI_DRAFT_CONFIG, type AiGenerationTrigger } from "@bushpop/config";
import { db } from "@bushpop/db/client";
import { aiGenerations, inventoryItems, inventoryItemImages } from "@bushpop/db/schema";
import {
  AppError,
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
  ValidationError,
} from "../../../../lib/errors.js";
import { enqueueAiDraftJob } from "../../../../lib/ai/draft-queue.js";
import { isAiDraftEnabled } from "../../../../lib/ai/provider.js";
import type { ResolvedDraft } from "../../../../lib/ai/resolve.js";

/**
 * AI draft endpoints service (task 6, D11/D12).
 *
 * POST enqueues and returns 202 with jobId = the ai_generations ulid;
 * the client polls GET at 1.5s up to ~20s. Caps are enforced inside the
 * enqueue transaction, serialised by a per-seller advisory lock:
 *   - 20 generations per seller per Sydney calendar day
 *   - 3 manual regenerates per listing
 *   - idempotent on pending (a pending generation for the item is returned
 *     instead of creating a new one)
 */

/** Start of the current Sydney calendar day, as a UTC timestamp (SQL). */
const SYDNEY_DAY_START = sql<Date>`(date_trunc('day', (now() AT TIME ZONE ${AI_DRAFT_CONFIG.caps.timezone})) AT TIME ZONE ${AI_DRAFT_CONFIG.caps.timezone})`;

async function findOwnedDraftItem(itemId: string, ownerId: string) {
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, itemId));
  if (!item || item.ownerId !== ownerId || item.lifecycleState === "archived") {
    throw new NotFoundError("Draft not found");
  }
  if (item.lifecycleState !== "owned") {
    throw new ConflictError("This item has been published — AI drafts only run on drafts");
  }
  return item;
}

export async function requestAiDraft(
  itemId: string,
  ownerId: string,
  trigger: AiGenerationTrigger,
) {
  if (!isAiDraftEnabled()) {
    throw new AppError("AI draft generation is not configured", 503, "AI_UNAVAILABLE");
  }

  await findOwnedDraftItem(itemId, ownerId);

  const [readyImage] = await db
    .select({ id: inventoryItemImages.id })
    .from(inventoryItemImages)
    .where(
      and(
        eq(inventoryItemImages.inventoryItemId, itemId),
        eq(inventoryItemImages.status, "ready"),
      ),
    )
    .limit(1);
  if (!readyImage) {
    throw new ValidationError("Add at least one photo before generating a draft");
  }

  const intendedProvider = process.env.GEMINI_API_KEY
    ? { name: AI_DRAFT_CONFIG.provider, model: AI_DRAFT_CONFIG.model }
    : { name: AI_DRAFT_CONFIG.escalationProvider, model: AI_DRAFT_CONFIG.escalationModel };

  const generationId = await db.transaction(async (tx) => {
    // Serialise concurrent enqueues for this seller so the cap counts below
    // cannot race (two in-flight requests both seeing 19 < 20).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`);

    // Idempotent on pending: reuse the in-flight generation for this item.
    const [pending] = await tx
      .select({ id: aiGenerations.id })
      .from(aiGenerations)
      .where(
        and(
          eq(aiGenerations.inventoryItemId, itemId),
          eq(aiGenerations.status, "pending"),
        ),
      )
      .limit(1);
    if (pending) return pending.id;

    const [dailyRow] = await tx
      .select({ count: count() })
      .from(aiGenerations)
      .where(
        and(
          eq(aiGenerations.sellerId, ownerId),
          gte(aiGenerations.createdAt, SYDNEY_DAY_START),
        ),
      );
    if ((dailyRow?.count ?? 0) >= AI_DRAFT_CONFIG.caps.draftsPerSellerPerDay) {
      throw new TooManyRequestsError(
        `Daily AI draft limit reached (${AI_DRAFT_CONFIG.caps.draftsPerSellerPerDay}/day)`,
      );
    }

    if (trigger === "regenerate") {
      const [regenRow] = await tx
        .select({ count: count() })
        .from(aiGenerations)
        .where(
          and(
            eq(aiGenerations.inventoryItemId, itemId),
            eq(aiGenerations.trigger, "regenerate"),
          ),
        );
      if ((regenRow?.count ?? 0) >= AI_DRAFT_CONFIG.caps.regeneratesPerListing) {
        throw new TooManyRequestsError(
          `Regenerate limit reached (${AI_DRAFT_CONFIG.caps.regeneratesPerListing} per listing)`,
        );
      }
    }

    const id = ulid();
    await tx.insert(aiGenerations).values({
      id,
      sellerId: ownerId,
      inventoryItemId: itemId,
      trigger,
      provider: intendedProvider.name,
      model: intendedProvider.model,
      promptVersion: AI_DRAFT_CONFIG.promptVersion,
      status: "pending",
    });
    return id;
  });

  // Enqueue after commit — the worker's first act is re-reading the row.
  await enqueueAiDraftJob({ generationId, inventoryItemId: itemId, sellerId: ownerId });

  return { jobId: generationId, status: "pending" as const };
}

export async function getAiDraftStatus(itemId: string, ownerId: string, jobId: string) {
  await findOwnedDraftItem(itemId, ownerId);

  const [generation] = await db
    .select()
    .from(aiGenerations)
    .where(and(eq(aiGenerations.id, jobId), eq(aiGenerations.inventoryItemId, itemId)));
  if (!generation || generation.sellerId !== ownerId) {
    throw new NotFoundError("AI draft job not found");
  }

  // `filtered` presents as failed — the client never sees flagged text,
  // just a silent empty form (D12).
  const clientStatus = generation.status === "filtered" ? "failed" : generation.status;

  const suggestions =
    generation.status === "completed" && generation.resolvedOutput
      ? (generation.resolvedOutput as ResolvedDraft)
      : null;

  return {
    jobId: generation.id,
    status: clientStatus as "pending" | "completed" | "failed",
    trigger: generation.trigger,
    suggestions,
    confidence: generation.status === "completed" ? generation.confidence : null,
    createdAt: generation.createdAt,
    completedAt: generation.completedAt,
  };
}
