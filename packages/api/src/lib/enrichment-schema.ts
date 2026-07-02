import { z } from "zod";
import { GARMENT_TYPES, COLOURS, MATERIALS } from "@bushpop/config/taxonomy";

export const enrichmentOutputSchema = z.object({
  title: z.string().max(80).trim().nullable(),
  description: z.string().max(1000).trim().nullable(),
  tags: z
    .array(z.string().trim().toLowerCase().pipe(z.string().max(30)))
    .max(8)
    .transform((tags) => [...new Set(tags)]),
  suggestedCategory: z
    .enum(GARMENT_TYPES as unknown as [string, ...string[]])
    .nullable(),
  suggestedColour: z
    .enum(COLOURS as unknown as [string, ...string[]])
    .nullable(),
  suggestedMaterial: z
    .enum(MATERIALS as unknown as [string, ...string[]])
    .nullable(),
  confidence: z.number().min(0).max(1),
});

export type EnrichmentOutput = z.infer<typeof enrichmentOutputSchema>;

/**
 * Lowercase enum fields before Zod validation.
 * Handles Claude's occasional capitalisation (e.g. "Tops" → "tops").
 */
export function normalizeModelOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  return {
    ...obj,
    suggestedCategory:
      typeof obj.suggestedCategory === "string"
        ? obj.suggestedCategory.toLowerCase()
        : obj.suggestedCategory,
    suggestedColour:
      typeof obj.suggestedColour === "string"
        ? obj.suggestedColour.toLowerCase()
        : obj.suggestedColour,
    suggestedMaterial:
      typeof obj.suggestedMaterial === "string"
        ? obj.suggestedMaterial.toLowerCase()
        : obj.suggestedMaterial,
  };
}

/**
 * Parse model output text into a JS object.
 * Tries direct JSON.parse first. Falls back to regex extraction
 * for responses wrapped in markdown fences or prose.
 */
export function parseModelOutput(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in response");
    return JSON.parse(match[0]);
  }
}
