export const LISTING_SCORE_VERSION = "v1" as const;

export const SCORE_NUDGE_MESSAGES = {
  photo:
    "Add more photos to improve your listing visibility. Listings with 3+ photos get more views.",
  description:
    "Write a longer description (30+ words) to help buyers find your item.",
  completeness:
    "Add measurements and condition notes to build buyer confidence.",
  category:
    "Set a category so your listing appears in the right search filters.",
} as const;

export type ScoreNudgeKey = keyof typeof SCORE_NUDGE_MESSAGES;
export type ListingQualityTier = "bronze" | "silver" | "gold";

/**
 * Map a strength-v3 component (listing-strength.ts) onto the existing nudge
 * vocabulary so the score worker keeps sending the same notification types.
 */
export function strengthComponentToNudgeKey(component: string): ScoreNudgeKey {
  switch (component) {
    case "photos":
      return "photo";
    case "description":
      return "description";
    case "category":
      return "category";
    default:
      return "completeness";
  }
}

export function scoreToQualityTier(score: number): ListingQualityTier {
  if (score >= 75) return "gold";
  if (score >= 50) return "silver";
  return "bronze";
}
