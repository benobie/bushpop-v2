/**
 * Prohibited-content patterns for AI-generated listing drafts.
 *
 * Run against the model's raw output BEFORE writing `resolved_output`; any
 * hit flips the generation to status `filtered` (client sees the same shape
 * as `failed` — a silent empty form, never the flagged text).
 *
 * Scope is deliberately narrow: counterfeit signals, off-platform payment /
 * contact steering, restricted goods, and PII that the prompt already
 * forbids. Fashion-adjacent words that merely LOOK risky ("knife pleat",
 * "gun-metal grey") must not match — patterns are word-bounded and specific.
 */

export const PROHIBITED_PATTERNS: readonly RegExp[] = [
  // Counterfeit signals
  /\b(replica|counterfeit|knock[\s-]?off|superfake|super\s+fake)\b/i,
  /\b(1\s*:\s*1|aaa\+?)\s*(copy|mirror|quality|grade)\b/i,
  /\bmirror[\s-]?quality\b/i,
  /\b(inspired\s+by|in\s+the\s+style\s+of)\s+(a\s+)?(gucci|louis\s+vuitton|chanel|prada|dior|hermes|hermès|balenciaga)\b/i,
  // Off-platform payment steering
  /\b(bank\s+transfer|direct\s+deposit|payid|western\s+union|cash\s?app|venmo)\b/i,
  /\bpaypal\s+(friends|f\s*&\s*f|ff)\b/i,
  /\bpay(ment)?\s+outside\s+(the\s+)?(app|site|platform)\b/i,
  // Contact exchange
  /\b(whats\s?app|wechat|we\s+chat|telegram|snapchat)\b/i,
  /\b(text|call|dm|message)\s+me\s+(at|on)\b/i,
  /\b(?:\+?61|0)4\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/, // AU mobile numbers
  /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i, // email addresses
  // Restricted goods
  /\b(firearm|handgun|rifle|ammunition|taser|stun\s+gun|pepper\s+spray|switchblade|flick\s+knife|butterfly\s+knife|knuckle\s*duster)\b/i,
];

/** All prohibited matches found in `text` (empty array = clean). */
export function findProhibitedTerms(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of PROHIBITED_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[0]) hits.push(match[0]);
  }
  return hits;
}

export function containsProhibitedTerms(text: string): boolean {
  return PROHIBITED_PATTERNS.some((pattern) => pattern.test(text));
}
