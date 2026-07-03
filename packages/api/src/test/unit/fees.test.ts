import { describe, expect, it } from "vitest";
import {
  calcFeeCents,
  calcPayoutCents,
  commissionRateAt,
  COMMISSION_SCHEDULE,
  PARCELS,
} from "@bushpop/config";

describe("commission config (fees.ts)", () => {
  it("schedule holds the launch rate: 175 bps + 30c from 2026-07-01", () => {
    expect(COMMISSION_SCHEDULE[0]).toEqual({
      effectiveFrom: "2026-07-01",
      bps: 175,
      fixedCents: 30,
    });
  });

  it("commissionRateAt picks the latest effective entry", () => {
    const rate = commissionRateAt(new Date("2026-08-15"));
    expect(rate.bps).toBe(175);
    expect(rate.fixedCents).toBe(30);
  });

  it("commissionRateAt before the first entry falls back to the oldest", () => {
    const rate = commissionRateAt(new Date("2020-01-01"));
    expect(rate.bps).toBe(175);
  });

  it("$200 item → fee exactly $3.80", () => {
    expect(calcFeeCents(20_000)).toBe(380);
  });

  // THE acceptance criterion: $200 sale, Medium prepaid label →
  // payout exactly $185.25 (fee $3.80 + label $10.95).
  it("$200 Medium prepaid → payout exactly $185.25", () => {
    const payout = calcPayoutCents(20_000, {
      prepaidLabelCents: PARCELS.medium.costCents,
    });
    expect(payout).toBe(18_525);
  });

  it("payout without a label deducts only the fee", () => {
    expect(calcPayoutCents(20_000)).toBe(19_620);
  });

  it("rounds the bps component to the nearest cent", () => {
    // 1999 * 175 / 10000 = 34.9825 → 35 + 30 = 65
    expect(calcFeeCents(1_999)).toBe(65);
    // 100 * 175 / 10000 = 1.75 → 2 + 30 = 32
    expect(calcFeeCents(100)).toBe(32);
  });

  it("rejects non-integer and negative prices", () => {
    expect(() => calcFeeCents(19.99)).toThrow();
    expect(() => calcFeeCents(-100)).toThrow();
  });
});
