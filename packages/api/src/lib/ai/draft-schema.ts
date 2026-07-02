import { z } from "zod";

/**
 * AI draft output contract (D12): {title, brand, category_leaf, colour,
 * description, confidence}. Empty string = "unsure" for brand/category/colour
 * — the model is told to never guess brands.
 */
export const aiDraftRawSchema = z.object({
  title: z.string().min(1).max(255),
  brand: z.string().max(100),
  category_leaf: z.string().max(100),
  colour: z.string().max(30),
  description: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1),
});

export type AiDraftRaw = z.infer<typeof aiDraftRawSchema>;

/**
 * Plain JSON Schema mirror of aiDraftRawSchema for Gemini's responseSchema
 * (constrained decoding). Keep the two in sync.
 */
export const AI_DRAFT_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    brand: { type: "string" },
    category_leaf: { type: "string" },
    colour: { type: "string" },
    description: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["title", "brand", "category_leaf", "colour", "description", "confidence"],
} as const;

/**
 * Parse + validate model text output. Tolerates markdown fences; throws on
 * anything that doesn't validate (caller escalates or fails the generation).
 */
export function parseAiDraftOutput(text: string): AiDraftRaw {
  let candidate = text.trim();
  const fenced = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced?.[1]) candidate = fenced[1];

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    throw new Error(
      `AI draft output is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const result = aiDraftRawSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `AI draft output failed schema validation: ${result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}
