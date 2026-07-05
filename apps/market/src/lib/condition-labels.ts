/**
 * Buyer-facing condition labels. Mirrors the enum in
 * components/sell/condition-step.tsx (new_with_tags/like_new/good/fair/poor)
 * — NOT the aspirational "New with tags · Like new · Excellent · Good · Well
 * loved" 5-step scale named in the U0 handoff. Reconciling the two is a U3
 * sell-wizard/data migration, out of scope for the U1 buyer funnel.
 */
export const CONDITION_LABELS: Record<string, string> = {
  new_with_tags: "New with tags",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

export function conditionLabel(condition: string | null): string | null {
  if (!condition) return null;
  return CONDITION_LABELS[condition] ?? condition;
}
