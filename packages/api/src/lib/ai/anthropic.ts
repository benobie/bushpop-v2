import { AI_DRAFT_CONFIG } from "@bushpop/config";
import { getClaudeClient } from "../claude.js";
import { parseAiDraftOutput } from "./draft-schema.js";
import { AI_DRAFT_SYSTEM_PROMPT, buildDraftUserText } from "./draft-prompt.js";
import {
  computeCostUsdMicros,
  type AiDraftImage,
  type AiDraftProvider,
} from "./provider.js";

/**
 * Claude Haiku 4.5 draft provider (D12 escalation path — runs when Gemini is
 * unavailable, throws, fails schema validation, or comes back below
 * minConfidence). Anthropic accepts image URLs directly, so presigned R2
 * URLs pass straight through. Note: Haiku's 4096-token minimum cacheable
 * prefix means this prompt doesn't cache — accepted (D12).
 */

export function createAnthropicDraftProvider(): AiDraftProvider {
  return {
    name: "anthropic",
    model: AI_DRAFT_CONFIG.escalationModel,
    async generateDraft(images: AiDraftImage[]) {
      const client = getClaudeClient();

      const response = await client.messages.create({
        model: AI_DRAFT_CONFIG.escalationModel,
        max_tokens: AI_DRAFT_CONFIG.maxOutputTokens,
        temperature: AI_DRAFT_CONFIG.temperature,
        system: AI_DRAFT_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              ...images.map((image) => ({
                type: "image" as const,
                source: { type: "url" as const, url: image.url },
              })),
              { type: "text" as const, text: buildDraftUserText() },
            ],
          },
        ],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Claude returned no text content for AI draft");
      }

      const inputTokens = response.usage?.input_tokens ?? null;
      const outputTokens = response.usage?.output_tokens ?? null;

      return {
        raw: parseAiDraftOutput(textBlock.text),
        inputTokens,
        outputTokens,
        costUsdMicros: computeCostUsdMicros("anthropic", inputTokens, outputTokens),
      };
    },
  };
}
