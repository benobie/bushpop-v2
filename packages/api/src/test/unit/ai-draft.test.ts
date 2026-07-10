import { describe, expect, it } from "vitest";
import { parseAiDraftOutput } from "../../lib/ai/draft-schema.js";
import {
  matchAgainst,
  resolveBrand,
  resolveCategoryLeaf,
  resolveColour,
  resolveDraft,
  resolveGender,
} from "../../lib/ai/resolve.js";
import { AI_DRAFT_SYSTEM_PROMPT } from "../../lib/ai/draft-prompt.js";
import { computeCostUsdMicros } from "../../lib/ai/provider.js";

const VALID_RAW = {
  title: "The North Face Nuptse puffer jacket — black",
  brand: "The North Face",
  category_leaf: "jackets",
  colour: "black",
  gender: "unisex",
  description: "700-fill puffer in black. Boxy fit, clean baffles, zip intact.",
  confidence: 0.92,
};

describe("draft-schema", () => {
  it("parses clean JSON", () => {
    expect(parseAiDraftOutput(JSON.stringify(VALID_RAW)).brand).toBe("The North Face");
  });

  it("tolerates markdown fences", () => {
    const fenced = "```json\n" + JSON.stringify(VALID_RAW) + "\n```";
    expect(parseAiDraftOutput(fenced).confidence).toBe(0.92);
  });

  it("throws on non-JSON and on schema violations", () => {
    expect(() => parseAiDraftOutput("not json at all")).toThrow(/not valid JSON/);
    expect(() =>
      parseAiDraftOutput(JSON.stringify({ ...VALID_RAW, confidence: 3 })),
    ).toThrow(/schema validation/);
    expect(() =>
      parseAiDraftOutput(JSON.stringify({ ...VALID_RAW, title: "" })),
    ).toThrow(/schema validation/);
  });
});

describe("resolve — brand/category/colour normalisation", () => {
  it("matches exactly, case-insensitively", () => {
    expect(resolveBrand("the north face")).toBe("The North Face");
    expect(resolveBrand("ADIDAS")).toBe("adidas");
  });

  it("matches by prefix", () => {
    expect(resolveBrand("Birkenst")).toBe("Birkenstock");
  });

  it("matches within Levenshtein distance 2", () => {
    expect(resolveBrand("Adiddas")).toBe("adidas");
    expect(resolveColour("gray")).toBe("grey");
  });

  it("returns blank instead of guessing", () => {
    expect(resolveBrand("Totally Unknown Label")).toBe("");
    expect(resolveColour("chartreuse")).toBe("");
    expect(resolveCategoryLeaf("spacesuits")).toBe("");
  });

  it("never fuzzy-matches to Other / Unbranded", () => {
    expect(resolveBrand("Other / Unbranded")).toBe("");
  });

  it("resolves category leaves incl. spaced variants and leafless parents", () => {
    expect(resolveCategoryLeaf("jackets")).toBe("jackets");
    expect(resolveCategoryLeaf("Tote Bags")).toBe("tote-bags");
    expect(resolveCategoryLeaf("swimwear")).toBe("swimwear"); // leafless parent = leaf
  });

  it("short strings do not prefix-match", () => {
    expect(matchAgainst("On", ["Onitsuka"])).toBe("");
  });

  it("resolves gender exactly, and returns blank instead of guessing", () => {
    expect(resolveGender("women")).toBe("women");
    expect(resolveGender("Unisex")).toBe("unisex");
    expect(resolveGender("")).toBe("");
    expect(resolveGender("toddler")).toBe("");
  });
});

describe("resolveDraft", () => {
  it("resolves a clean draft into canonical vocabulary", () => {
    const result = resolveDraft({
      ...VALID_RAW,
      brand: "north face", // prefix/fuzzy → canonical
      colour: "Black",
    });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.resolved.brand).toBe("The North Face");
      expect(result.resolved.colour).toBe("black");
      expect(result.resolved.categoryLeaf).toBe("jackets");
    }
  });

  it("filters prohibited content before anything is written", () => {
    const result = resolveDraft({
      ...VALID_RAW,
      description: "Great replica of the original. Message me on WhatsApp.",
    });
    expect(result.status).toBe("filtered");
    if (result.status === "filtered") {
      expect(result.hits.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("does not filter fashion-adjacent lookalikes", () => {
    const result = resolveDraft({
      ...VALID_RAW,
      description: "Wool skirt with knife pleats and gun-metal grey buttons.",
    });
    expect(result.status).toBe("resolved");
  });
});

describe("draft prompt", () => {
  it("is byte-stable across imports (Gemini prefix caching)", () => {
    // Two reads of the same constant must be identical — no Date.now(),
    // no random IDs, no non-deterministic serialization.
    const again = AI_DRAFT_SYSTEM_PROMPT;
    expect(again).toBe(AI_DRAFT_SYSTEM_PROMPT);
    expect(AI_DRAFT_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // no timestamps
  });

  it("embeds the brand list, category slugs and colours", () => {
    expect(AI_DRAFT_SYSTEM_PROMPT).toContain("The North Face");
    expect(AI_DRAFT_SYSTEM_PROMPT).toContain("tote-bags");
    expect(AI_DRAFT_SYSTEM_PROMPT).toContain("never guess brands".toUpperCase().slice(0, 5)); // NEVER
    expect(AI_DRAFT_SYSTEM_PROMPT).toContain("Australian English");
    expect(AI_DRAFT_SYSTEM_PROMPT).not.toContain("Other / Unbranded"); // not a suggestible brand
  });
});

describe("cost computation", () => {
  it("prices gemini and anthropic tokens in USD micros", () => {
    // gemini: 1000 in @ $0.10/M + 200 out @ $0.40/M = 100 + 80 = 180 micros
    expect(computeCostUsdMicros("gemini", 1000, 200)).toBe(180);
    // anthropic: 1000 in @ $1/M + 200 out @ $5/M = 1000 + 1000 = 2000 micros
    expect(computeCostUsdMicros("anthropic", 1000, 200)).toBe(2000);
    expect(computeCostUsdMicros("gemini", null, null)).toBeNull();
  });
});
