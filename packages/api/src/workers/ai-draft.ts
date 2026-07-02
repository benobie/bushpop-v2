import { Worker } from "bullmq";
import { and, eq } from "drizzle-orm";
import { AI_DRAFT_CONFIG } from "@bushpop/config";
import { db } from "@bushpop/db/client";
import { aiGenerations, inventoryItems, inventoryItemImages } from "@bushpop/db/schema";
import { getRedis } from "../lib/redis.js";
import { createPresignedGetUrl } from "../lib/r2.js";
import { AI_DRAFT_QUEUE, type AiDraftJobData } from "../lib/ai/draft-queue.js";
import { AI_DRAFT_PROMPT_VERSION } from "../lib/ai/draft-prompt.js";
import { resolveDraft, type ResolvedDraft } from "../lib/ai/resolve.js";
import {
  getEscalationProvider,
  getPrimaryProvider,
  MIN_CONFIDENCE,
  type AiDraftGenerationResult,
  type AiDraftProvider,
} from "../lib/ai/provider.js";

/**
 * ai-draft worker (task 6, D12). jobId = ai_generations ulid; status lives
 * in Postgres. Escalation (Gemini → Haiku) on throw, schema-fail or
 * low-confidence happens INSIDE one job run — the queue does not retry
 * (attempts: 1 on enqueue), so every generation terminates in exactly one
 * of completed | failed | filtered.
 *
 * AI writes ONLY the item's ai* suggestion columns — never canonical
 * fields (confirm-not-commit). The old enrichment COALESCE-into-canonical
 * behaviour is deliberately NOT reused.
 */

const MAX_IMAGES = 4;

interface AttemptOutcome {
  provider: AiDraftProvider;
  result: AiDraftGenerationResult;
}

async function runWithEscalation(
  images: Array<{ url: string; contentType?: string | null }>,
): Promise<AttemptOutcome> {
  const primary = await getPrimaryProvider();
  const escalation = await getEscalationProvider();

  const first = primary ?? escalation;
  if (!first) {
    throw new Error("No AI draft provider configured");
  }

  let firstError: unknown = null;
  try {
    const result = await first.generateDraft(images);
    if (result.raw.confidence >= MIN_CONFIDENCE) {
      return { provider: first, result };
    }
    firstError = new Error(
      `Primary confidence ${result.raw.confidence} below minimum ${MIN_CONFIDENCE}`,
    );
    // Low confidence — fall through to escalation if one exists; otherwise
    // return the low-confidence result and let the caller decide.
    if (!escalation || escalation === first || escalation.name === first.name) {
      return { provider: first, result };
    }
  } catch (err) {
    firstError = err;
    if (!escalation || escalation.name === first.name) {
      throw err;
    }
  }

  try {
    const result = await escalation!.generateDraft(images);
    return { provider: escalation!, result };
  } catch (escalationErr) {
    console.error("[ai-draft] Escalation provider failed:", escalationErr);
    throw firstError ?? escalationErr;
  }
}

async function finaliseGeneration(
  generationId: string,
  inventoryItemId: string,
  outcome: {
    status: "completed" | "failed" | "filtered";
    provider?: AiDraftProvider;
    result?: AiDraftGenerationResult;
    resolved?: ResolvedDraft;
    error?: string;
    latencyMs: number;
  },
): Promise<void> {
  const { status, provider, result, resolved, error, latencyMs } = outcome;

  await db.transaction(async (tx) => {
    await tx
      .update(aiGenerations)
      .set({
        status,
        provider: provider?.name,
        model: provider?.model,
        inputTokens: result?.inputTokens ?? null,
        outputTokens: result?.outputTokens ?? null,
        costUsdMicros: result?.costUsdMicros ?? null,
        latencyMs,
        confidence: result?.raw.confidence ?? null,
        rawOutput: result ? result.raw : null,
        resolvedOutput: resolved ?? null,
        error: error ?? null,
        completedAt: new Date(),
      })
      .where(eq(aiGenerations.id, generationId));

    if (status === "completed" && resolved) {
      // Mirror into the item's ai* suggestion columns ONLY.
      await tx
        .update(inventoryItems)
        .set({
          aiTitle: resolved.title,
          aiDescription: resolved.description,
          aiSuggestedBrand: resolved.brand || null,
          aiSuggestedCategory: resolved.categoryLeaf || null,
          aiSuggestedColour: resolved.colour || null,
          aiConfidence: resolved.confidence,
          aiPromptVersion: AI_DRAFT_PROMPT_VERSION,
          aiModel: provider?.model ?? AI_DRAFT_CONFIG.model,
          aiStatus: "completed",
          aiEnrichedAt: new Date(),
          aiLastError: null,
        })
        .where(eq(inventoryItems.id, inventoryItemId));
    } else {
      await tx
        .update(inventoryItems)
        .set({ aiStatus: "failed", aiLastError: error ?? null })
        .where(eq(inventoryItems.id, inventoryItemId));
    }
  });
}

export async function processAiDraftJob(data: AiDraftJobData): Promise<void> {
  const { generationId, inventoryItemId } = data;
  const startedAt = Date.now();

  const [generation] = await db
    .select()
    .from(aiGenerations)
    .where(eq(aiGenerations.id, generationId));
  if (!generation || generation.status !== "pending") return; // idempotent

  const images = await db
    .select({
      storageKey: inventoryItemImages.storageKey,
      contentType: inventoryItemImages.contentType,
    })
    .from(inventoryItemImages)
    .where(
      and(
        eq(inventoryItemImages.inventoryItemId, inventoryItemId),
        eq(inventoryItemImages.status, "ready"),
      ),
    )
    .orderBy(inventoryItemImages.position)
    .limit(MAX_IMAGES);

  if (images.length === 0) {
    await finaliseGeneration(generationId, inventoryItemId, {
      status: "failed",
      error: "No ready images on item",
      latencyMs: Date.now() - startedAt,
    });
    return;
  }

  try {
    const imageInputs = await Promise.all(
      images.map(async (img) => ({
        url: await createPresignedGetUrl(img.storageKey),
        contentType: img.contentType,
      })),
    );

    const { provider, result } = await runWithEscalation(imageInputs);

    if (result.raw.confidence < MIN_CONFIDENCE) {
      await finaliseGeneration(generationId, inventoryItemId, {
        status: "failed",
        provider,
        result,
        error: `Confidence ${result.raw.confidence} below minimum ${MIN_CONFIDENCE}`,
        latencyMs: Date.now() - startedAt,
      });
      return;
    }

    const resolution = resolveDraft(result.raw);
    if (resolution.status === "filtered") {
      await finaliseGeneration(generationId, inventoryItemId, {
        status: "filtered",
        provider,
        result,
        error: `Prohibited content: ${resolution.hits.join(", ")}`,
        latencyMs: Date.now() - startedAt,
      });
      return;
    }

    await finaliseGeneration(generationId, inventoryItemId, {
      status: "completed",
      provider,
      result,
      resolved: resolution.resolved,
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ai-draft] Generation ${generationId} failed:`, message);
    await finaliseGeneration(generationId, inventoryItemId, {
      status: "failed",
      error: message,
      latencyMs: Date.now() - startedAt,
    });
  }
}

export function startAiDraftWorker(): Worker {
  const worker = new Worker<AiDraftJobData>(
    AI_DRAFT_QUEUE,
    async (job) => processAiDraftJob(job.data),
    {
      connection: getRedis(),
      concurrency: 3,
      limiter: { max: 30, duration: 60_000 },
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[ai-draft] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
