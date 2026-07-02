import {
  allCategoryLeafSlugs,
  BRANDS,
  COLOURS,
  findProhibitedTerms,
} from "@bushpop/config";
import type { AiDraftRaw } from "./draft-schema.js";

/**
 * Normalise raw model output into canonical vocabulary (D12):
 * exact → prefix → Levenshtein ≤2 against BRANDS / category leaf slugs /
 * COLOURS; no match ⇒ "" (blank field, never a guess). Prohibited-content
 * scan runs BEFORE anything is written — a hit flips the generation to
 * `filtered` (client sees the same shape as failed: silent empty form).
 */

export interface ResolvedDraft {
  title: string;
  brand: string;
  categoryLeaf: string;
  colour: string;
  description: string;
  confidence: number;
}

export type ResolveResult =
  | { status: "resolved"; resolved: ResolvedDraft }
  | { status: "filtered"; hits: string[] };

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i, ...new Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = curr;
  }
  return prev[n]!;
}

/**
 * Match `raw` against `candidates`: case-insensitive exact, then prefix
 * (either direction, min 3 chars), then containment (min 4 chars — catches
 * "north face" → "The North Face"), then Levenshtein ≤2. Returns the
 * canonical candidate or "" when nothing is close enough.
 */
export function matchAgainst(raw: string, candidates: readonly string[]): string {
  const needle = raw.trim().toLowerCase();
  if (!needle) return "";

  for (const candidate of candidates) {
    if (candidate.toLowerCase() === needle) return candidate;
  }

  if (needle.length >= 3) {
    for (const candidate of candidates) {
      const hay = candidate.toLowerCase();
      if (hay.startsWith(needle) || needle.startsWith(hay)) return candidate;
    }
  }

  if (needle.length >= 4) {
    for (const candidate of candidates) {
      const hay = candidate.toLowerCase();
      if (hay.length >= 4 && (hay.includes(needle) || needle.includes(hay))) {
        return candidate;
      }
    }
  }

  let best = "";
  let bestDistance = 3; // must be ≤ 2
  for (const candidate of candidates) {
    const distance = levenshtein(needle, candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

const MATCHABLE_BRANDS = BRANDS.filter((brand) => brand !== "Other / Unbranded");

export function resolveBrand(raw: string): string {
  return matchAgainst(raw, MATCHABLE_BRANDS);
}

export function resolveCategoryLeaf(raw: string): string {
  // Model returns slugs; tolerate spaced/cased variants ("Tote Bags" → tote-bags).
  const slugified = raw.trim().toLowerCase().replace(/\s+/g, "-");
  return matchAgainst(slugified, allCategoryLeafSlugs());
}

export function resolveColour(raw: string): string {
  return matchAgainst(raw, COLOURS);
}

export function resolveDraft(raw: AiDraftRaw): ResolveResult {
  const hits = findProhibitedTerms(
    `${raw.title}\n${raw.brand}\n${raw.description}`,
  );
  if (hits.length > 0) {
    return { status: "filtered", hits };
  }

  return {
    status: "resolved",
    resolved: {
      title: raw.title.trim().slice(0, 255),
      brand: resolveBrand(raw.brand),
      categoryLeaf: resolveCategoryLeaf(raw.category_leaf),
      colour: resolveColour(raw.colour),
      description: raw.description.trim().slice(0, 2000),
      confidence: raw.confidence,
    },
  };
}
