/**
 * AI draft-generation config (D12).
 *
 * Provider-agnostic service: Gemini 2.5 Flash-Lite default (implicit prefix
 * caching via a byte-stable system prompt), Claude Haiku 4.5 escalation on
 * throw / schema-fail / low confidence. AI writes ONLY `ai*` suggestion
 * columns — never canonical fields (confirm-not-commit).
 */

export const AI_DRAFT_CONFIG = {
  provider: "gemini",
  model: "gemini-2.5-flash-lite",
  escalationProvider: "anthropic",
  escalationModel: "claude-haiku-4-5",
  temperature: 0,
  maxOutputTokens: 512,
  /** Below this the primary result is discarded and escalation runs. */
  minConfidence: 0.4,
  /** Version stamp written to ai_generations.prompt_version. */
  promptVersion: "v1",
  caps: {
    /** Manual regenerates per listing (trigger = "regenerate"). */
    regeneratesPerListing: 3,
    /** Draft generations per seller per calendar day. */
    draftsPerSellerPerDay: 20,
    /** Calendar-day boundary for the daily cap. */
    timezone: "Australia/Sydney",
  },
  /** Poll contract (D11): client polls GET .../ai-draft/:jobId. */
  polling: {
    intervalMs: 1500,
    cutoffMs: 20_000,
  },
} as const;

export type AiProvider = "gemini" | "anthropic";

export const AI_GENERATION_TRIGGERS = ["auto", "regenerate"] as const;
export type AiGenerationTrigger = (typeof AI_GENERATION_TRIGGERS)[number];

export const AI_GENERATION_STATUSES = [
  "pending",
  "completed",
  "failed",
  "filtered",
] as const;
export type AiGenerationStatus = (typeof AI_GENERATION_STATUSES)[number];
