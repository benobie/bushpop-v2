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
