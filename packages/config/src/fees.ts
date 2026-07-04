/**
 * Bushpop commission — effective-dated config (D9).
 *
 * The commission schedule is static config, not a DB table: git is the audit
 * trail. Components must NEVER hard-code the rate — import `calcFeeCents` /
 * `calcPayoutCents` from `@bushpop/config`.
 *
 * Current take: 1.75% (175 bps) + AU$0.30 flat per order (confirmed vs live
 * Dokan 30/06/2026).
 */

export interface CommissionRate {
  /** ISO date (Australia/Sydney intent) this rate applies from, inclusive. */
  effectiveFrom: string;
  /** Percentage component in basis points (175 = 1.75%). */
  bps: number;
  /** Flat component in cents, added once per order line. */
  fixedCents: number;
}

/** Ordered oldest → newest. Append new entries; never mutate history. */
export const COMMISSION_SCHEDULE: readonly CommissionRate[] = [
  { effectiveFrom: "2026-07-01", bps: 175, fixedCents: 30 },
] as const;

/** The rate in force at `at` (defaults to now). Falls back to the oldest entry. */
export function commissionRateAt(at: Date = new Date()): CommissionRate {
  let current = COMMISSION_SCHEDULE[0]!;
  for (const rate of COMMISSION_SCHEDULE) {
    if (new Date(rate.effectiveFrom).getTime() <= at.getTime()) {
      current = rate;
    }
  }
  return current;
}

/**
 * Buyer Protection fee — effective-dated config (Fee Model D, decided
 * 04/07/2026, task 8ecbbbcf). Charged to the BUYER on top of item subtotal +
 * shipping; never deducted from seller proceeds (seller commission above is
 * fully independent of this fee).
 *
 * Posted orders: 4% (400 bps) of the posted-items subtotal + AU$0.50 flat,
 * no cap. Pickup orders: $0 — narrowed cover is included free, never
 * fee-gated. Revisited only at the monthly metrics review with real data.
 */
export interface BuyerProtectionRate {
  /** ISO date (Australia/Sydney intent) this rate applies from, inclusive. */
  effectiveFrom: string;
  /** Percentage component in basis points (400 = 4%). */
  bps: number;
  /** Flat component in cents, added once per order — only when the order has posted items. */
  fixedCents: number;
}

/** Ordered oldest → newest. Append new entries; never mutate history. */
export const BUYER_PROTECTION_SCHEDULE: readonly BuyerProtectionRate[] = [
  { effectiveFrom: "2026-07-04", bps: 400, fixedCents: 50 },
] as const;

/** The rate in force at `at` (defaults to now). Falls back to the oldest entry. */
export function buyerProtectionRateAt(at: Date = new Date()): BuyerProtectionRate {
  let current = BUYER_PROTECTION_SCHEDULE[0]!;
  for (const rate of BUYER_PROTECTION_SCHEDULE) {
    if (new Date(rate.effectiveFrom).getTime() <= at.getTime()) {
      current = rate;
    }
  }
  return current;
}

/**
 * Buyer Protection fee for a posted-items subtotal, in cents. Returns 0 when
 * there is no posted subtotal (pure pickup order) — the fixed component only
 * applies when the order actually has something being posted.
 * $50.00 (5000c) posted → round(5000*400/10000) + 50 = 200 + 50 = 250c ($2.50).
 */
export function calcBuyerProtectionFeeCents(postedSubtotalCents: number, at?: Date): number {
  if (!Number.isInteger(postedSubtotalCents) || postedSubtotalCents < 0) {
    throw new Error(
      `calcBuyerProtectionFeeCents: postedSubtotalCents must be a non-negative integer, got ${postedSubtotalCents}`,
    );
  }
  if (postedSubtotalCents === 0) return 0;
  const rate = buyerProtectionRateAt(at);
  return Math.round((postedSubtotalCents * rate.bps) / 10_000) + rate.fixedCents;
}

/**
 * Bushpop fee for a sale price, in cents.
 * $200.00 (20000c) → 350 + 30 = 380c ($3.80).
 */
export function calcFeeCents(priceCents: number, at?: Date): number {
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw new Error(`calcFeeCents: priceCents must be a non-negative integer, got ${priceCents}`);
  }
  const rate = commissionRateAt(at);
  return Math.round((priceCents * rate.bps) / 10_000) + rate.fixedCents;
}

/**
 * Seller payout for a sale price after the Bushpop fee and (optionally) a
 * prepaid shipping label deduction.
 * $200.00 with a Medium prepaid label (1095c) → 20000 - 380 - 1095 = 18525c ($185.25).
 */
export function calcPayoutCents(
  priceCents: number,
  opts: { prepaidLabelCents?: number; at?: Date } = {},
): number {
  const fee = calcFeeCents(priceCents, opts.at);
  const label = opts.prepaidLabelCents ?? 0;
  return priceCents - fee - label;
}
