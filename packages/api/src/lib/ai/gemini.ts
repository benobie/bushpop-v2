import { GoogleGenAI } from "@google/genai";
import { AI_DRAFT_CONFIG } from "@bushpop/config";
import { AI_DRAFT_JSON_SCHEMA, parseAiDraftOutput } from "./draft-schema.js";
import { AI_DRAFT_SYSTEM_PROMPT, buildDraftUserText } from "./draft-prompt.js";
import {
  computeCostUsdMicros,
  type AiDraftImage,
  type AiDraftProvider,
} from "./provider.js";

/**
 * Gemini 2.5 Flash-Lite draft provider (D12 primary).
 *
 * Images arrive as presigned R2 GET URLs — Gemini can't fetch arbitrary
 * URLs, so originals are fetched here and inlined base64. The system prompt
 * is byte-stable so Gemini's implicit prefix caching engages for free.
 */

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

async function fetchImageAsBase64(
  image: AiDraftImage,
): Promise<{ mimeType: string; data: string }> {
  const response = await fetch(image.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image for AI draft (HTTP ${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType =
    image.contentType ?? response.headers.get("content-type") ?? "image/jpeg";
  return { mimeType, data: buffer.toString("base64") };
}

export function createGeminiDraftProvider(): AiDraftProvider {
  return {
    name: "gemini",
    model: AI_DRAFT_CONFIG.model,
    async generateDraft(images: AiDraftImage[]) {
      const client = getGeminiClient();
      const inlineImages = await Promise.all(images.map(fetchImageAsBase64));

      const response = await client.models.generateContent({
        model: AI_DRAFT_CONFIG.model,
        contents: [
          {
            role: "user",
            parts: [
              ...inlineImages.map((img) => ({
                inlineData: { mimeType: img.mimeType, data: img.data },
              })),
              { text: buildDraftUserText() },
            ],
          },
        ],
        config: {
          systemInstruction: AI_DRAFT_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: AI_DRAFT_JSON_SCHEMA,
          temperature: AI_DRAFT_CONFIG.temperature,
          maxOutputTokens: AI_DRAFT_CONFIG.maxOutputTokens,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Gemini returned no text content for AI draft");
      }

      const inputTokens = response.usageMetadata?.promptTokenCount ?? null;
      const outputTokens = response.usageMetadata?.candidatesTokenCount ?? null;

      return {
        raw: parseAiDraftOutput(text),
        inputTokens,
        outputTokens,
        costUsdMicros: computeCostUsdMicros("gemini", inputTokens, outputTokens),
      };
    },
  };
}
