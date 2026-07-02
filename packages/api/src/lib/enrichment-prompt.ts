import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";

export const PROMPT_VERSION = "1.0.0";
export const ENRICHMENT_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a fashion item cataloguing assistant for Bushpop, an Australian secondhand fashion marketplace.
Analyse the product photo(s) and produce structured listing data.

Respond with ONLY valid JSON matching this exact schema — no markdown fences, no commentary:
{
  "title": "string, max 80 chars — descriptive product title",
  "description": "string, 2-4 sentences, concise and factual",
  "tags": ["string", ...],
  "suggestedCategory": "string or null",
  "suggestedColour": "string or null",
  "suggestedMaterial": "string or null",
  "confidence": 0.0-1.0
}

RULES:
- title: Include brand ONLY if text or logo is clearly legible in the photo — never guess brands. Include colour, style, and garment type. Use Australian English (e.g. "grey" not "gray", "colour" not "color").
- description: Describe ONLY what is visible. Do not invent features. Note visible tags, labels, or distinctive details. Do NOT call out stains, wear, or defects unless extremely obvious — subtle shadows and wrinkles are not defects.
- tags: 3-8 freeform style descriptors. Examples: "vintage", "oversized", "cropped", "y2k", "streetwear", "minimalist", "retro", "boho", "workwear", "formal", "casual". Do NOT repeat the category, colour, or material as tags.
- suggestedCategory: One of: tops, bottoms, dresses, outerwear, footwear, bags, accessories, swimwear, activewear, other. Use null if uncertain.
- suggestedColour: One of: black, white, grey, navy, blue, green, red, pink, yellow, orange, purple, brown, beige, multi, print, other. Use null if uncertain.
- suggestedMaterial: One of: cotton, linen, silk, wool, denim, leather, synthetic, knit, velvet, satin, other. Use null if uncertain.
- confidence: 0.9+ = clear, well-lit, single item. 0.6-0.8 = partially obscured or ambiguous. Below 0.5 = poor quality photos.
- If multiple items visible, catalogue the PRIMARY (largest/most prominent) item only.
- If the image does NOT contain a fashion/clothing item, return all fields as null with confidence 0.0:
  {"title": null, "description": null, "tags": [], "suggestedCategory": null, "suggestedColour": null, "suggestedMaterial": null, "confidence": 0.0}`;

interface EnrichmentContext {
  brand?: string | null;
  condition?: string | null;
  categoryHint?: string | null;
}

export function buildEnrichmentRequest(
  imageUrls: string[],
  context: EnrichmentContext,
): MessageCreateParamsNonStreaming {
  const contextBlock = [
    `- Brand: ${context.brand || "not provided"}`,
    `- Condition: ${context.condition || "not provided"}`,
    `- Category hint: ${context.categoryHint || "not provided"}`,
  ].join("\n");

  const systemPrompt = `${SYSTEM_PROMPT}\n\nCONTEXT (may be empty — use as hints, not gospel):\n${contextBlock}`;

  const imageContent = imageUrls.map(
    (url) =>
      ({
        type: "image" as const,
        source: { type: "url" as const, url },
      }),
  );

  return {
    model: ENRICHMENT_MODEL,
    max_tokens: 512,
    temperature: 0,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          { type: "text", text: "Catalogue this fashion item." },
        ],
      },
    ],
  };
}
