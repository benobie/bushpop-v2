import { AI_DRAFT_CONFIG, type AiProvider } from "@bushpop/config";
import type { AiDraftRaw } from "./draft-schema.js";

/**
 * Provider-agnostic AI draft generation (D12). Gemini 2.5 Flash-Lite is the
 * primary; Claude Haiku 4.5 the escalation on throw / schema-fail /
 * low-confidence. ALL tests mock this module — no live key ever runs in the
 * test suite.
 */

export interface AiDraftImage {
  /** Presigned GET URL for the original photo. */
  url: string;
  contentType?: string | null;
}

export interface AiDraftGenerationResult {
  raw: AiDraftRaw;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsdMicros: number | null;
}

export interface AiDraftProvider {
  name: AiProvider;
  model: string;
  generateDraft(images: AiDraftImage[]): Promise<AiDraftGenerationResult>;
}

/** USD micro-dollars per 1M tokens, per provider (cost report 2026-07). */
const PRICING: Record<AiProvider, { inputPerMTok: number; outputPerMTok: number }> = {
  // Gemini 2.5 Flash-Lite: $0.10 / $0.40 per MTok
  gemini: { inputPerMTok: 100_000, outputPerMTok: 400_000 },
  // Claude Haiku 4.5: $1 / $5 per MTok
  anthropic: { inputPerMTok: 1_000_000, outputPerMTok: 5_000_000 },
};

export function computeCostUsdMicros(
  provider: AiProvider,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  if (inputTokens === null && outputTokens === null) return null;
  const pricing = PRICING[provider];
  const inputCost = ((inputTokens ?? 0) * pricing.inputPerMTok) / 1_000_000;
  const outputCost = ((outputTokens ?? 0) * pricing.outputPerMTok) / 1_000_000;
  return Math.round(inputCost + outputCost);
}

/** Primary provider — Gemini, present only when GEMINI_API_KEY is set. */
export async function getPrimaryProvider(): Promise<AiDraftProvider | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  const { createGeminiDraftProvider } = await import("./gemini.js");
  return createGeminiDraftProvider();
}

/** Escalation provider — Anthropic, present only when ANTHROPIC_API_KEY is set. */
export async function getEscalationProvider(): Promise<AiDraftProvider | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const { createAnthropicDraftProvider } = await import("./anthropic.js");
  return createAnthropicDraftProvider();
}

export function isAiDraftEnabled(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export const MIN_CONFIDENCE = AI_DRAFT_CONFIG.minConfidence;
