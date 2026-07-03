/**
 * Listing strength v3 — the shared 0–100 rubric (D10).
 *
 * ONE pure, dep-free function with three callers: the drafts API
 * (GET/publish), the listing-score worker, and the web sell wizard. Identity
 * client/server by construction — do NOT fork this logic anywhere.
 *
 * Rubric (design prototype v3, `design/home/sell.html` score()):
 *   photos 5 ea (max 20) · title ≥8 chars 10 · brand 5 · category 10 ·
 *   size 10 (bags/accessories exempt, D18) · colour 5 · description ≥40
 *   chars 10 · condition 10 · measurements 10 · price 10 · RRP +3 bonus ·
 *   offers +2 bonus · capped at 100.
 *
 * D19: offers are excluded day 1 — the weight stays in the module and
 * callers pass `offersEnabled: false`, so the complete-fixture parity score
 * is 75 for the seeded suite-2 draft (77 with offers), not a forked rubric.
 */

export const LISTING_STRENGTH_VERSION = "v3" as const;

export const STRENGTH_COMPONENT_KEYS = [
  "photos",
  "title",
  "brand",
  "category",
  "size",
  "colour",
  "description",
  "condition",
  "measurements",
  "price",
  "rrp",
  "offers",
] as const;

export type StrengthComponentKey = (typeof STRENGTH_COMPONENT_KEYS)[number];

/** Wizard step each component lives on (0 Photos, 1 Details, 2 Condition, 3 Price). */
export const STRENGTH_COMPONENT_STEPS: Record<StrengthComponentKey, number> = {
  photos: 0,
  title: 1,
  brand: 1,
  category: 1,
  size: 1,
  colour: 1,
  description: 1,
  condition: 2,
  measurements: 2,
  price: 3,
  rrp: 3,
  offers: 3,
};

export const STRENGTH_MAX_POINTS: Record<StrengthComponentKey, number> = {
  photos: 20,
  title: 10,
  brand: 5,
  category: 10,
  size: 10,
  colour: 5,
  description: 10,
  condition: 10,
  measurements: 10,
  price: 10,
  rrp: 3,
  offers: 2,
};

export interface ListingStrengthInput {
  photoCount: number;
  title: string | null | undefined;
  brand: string | null | undefined;
  /** Leaf category — presence is what scores, not the value. */
  categoryLeaf: string | null | undefined;
  size: string | null | undefined;
  /** Bags/accessories have no size vocabulary — award the size points (D18). */
  sizeExempt?: boolean;
  colour: string | null | undefined;
  description: string | null | undefined;
  condition: string | null | undefined;
  hasMeasurements: boolean;
  priceCents: number | null | undefined;
  rrpCents: number | null | undefined;
  /** Day 1: always false (D19). The +2 weight stays here for later. */
  offersEnabled?: boolean;
}

export interface StrengthMissing {
  key: StrengthComponentKey;
  label: string;
  step: number;
  points: number;
}

export interface ListingStrengthResult {
  /** 0–100 (capped). */
  score: number;
  /** Points earned per component — persisted as `listing_scores.breakdown`. */
  breakdown: Record<StrengthComponentKey, number>;
  /** Everything not yet earned, sorted by points desc (UI shows top 3). */
  missing: StrengthMissing[];
}

const MISSING_LABELS: Record<Exclude<StrengthComponentKey, "photos">, string> = {
  title: "Write a title",
  brand: "Add the brand",
  category: "Pick a category",
  size: "Pick a size",
  colour: "Pick a colour",
  description: "Describe it (40+ characters)",
  condition: "Set the condition",
  measurements: "Add measurements",
  price: "Set a price",
  rrp: "Add the RRP",
  offers: "Switch on offers",
};

export function computeListingStrength(input: ListingStrengthInput): ListingStrengthResult {
  const breakdown = {} as Record<StrengthComponentKey, number>;
  const missing: StrengthMissing[] = [];

  const add = (key: StrengthComponentKey, ok: boolean): void => {
    const points = STRENGTH_MAX_POINTS[key];
    breakdown[key] = ok ? points : 0;
    if (!ok && key !== "photos") {
      missing.push({
        key,
        label: MISSING_LABELS[key as Exclude<StrengthComponentKey, "photos">],
        step: STRENGTH_COMPONENT_STEPS[key],
        points,
      });
    }
  };

  // Photos: 5 points each up to 4 (partial credit, prototype-exact).
  const photoCount = Math.max(0, Math.floor(input.photoCount));
  const photoPoints = Math.min(photoCount, 4) * 5;
  breakdown.photos = photoPoints;
  if (photoCount < 4) {
    const remaining = 4 - photoCount;
    missing.push({
      key: "photos",
      label: `Add ${remaining} more photo${remaining === 1 ? "" : "s"}`,
      step: STRENGTH_COMPONENT_STEPS.photos,
      points: remaining * 5,
    });
  }

  add("title", (input.title ?? "").trim().length >= 8);
  add("brand", !!(input.brand ?? "").trim());
  add("category", !!(input.categoryLeaf ?? "").toString().trim());
  add("size", input.sizeExempt === true || !!(input.size ?? "").trim());
  add("colour", !!(input.colour ?? "").trim());
  add("description", (input.description ?? "").trim().length >= 40);
  add("condition", !!(input.condition ?? "").trim());
  add("measurements", input.hasMeasurements);
  add("price", (input.priceCents ?? 0) > 0);
  add("rrp", (input.rrpCents ?? 0) > 0);
  add("offers", input.offersEnabled === true);

  const total = Object.values(breakdown).reduce((sum, points) => sum + points, 0);
  missing.sort((a, b) => b.points - a.points);

  return { score: Math.min(100, total), breakdown, missing };
}

export type StrengthBand = "just-started" | "good-start" | "strong" | "excellent";

/** Prototype bands: Just started / Good start (40) / Strong (70) / Excellent (90). */
export function strengthBand(score: number): StrengthBand {
  if (score >= 90) return "excellent";
  if (score >= 70) return "strong";
  if (score >= 40) return "good-start";
  return "just-started";
}
