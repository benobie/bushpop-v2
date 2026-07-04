import { describe, expect, it } from "vitest";
import { calcBuyerProtectionFeeCents, calcFeeCents } from "@bushpop/config";
import { calculateOrderTotals } from "../../lib/order-totals.js";

const prepaid200Medium = {
  priceCents: 20_000,
  shippingClass: "m",
  shippingOption: "prepaid",
  parcelSize: "medium",
};

describe("calculateOrderTotals (shared money math)", () => {
  it("acceptance: $200 Medium prepaid → payout exactly $185.25 (BP fee does not touch seller proceeds)", () => {
    const totals = calculateOrderTotals([prepaid200Medium], "AUD");
    expect(totals.platformFeeCents).toBe(380);
    expect(totals.prepaidLabelCents).toBe(1095);
    expect(totals.shippingCents).toBe(0);
    // prepaid is a posted order → BP fee applies: 4% of 20000 + 50 = 850
    expect(totals.buyerProtectionFeeCents).toBe(850);
    expect(totals.totalCents).toBe(20_850);
    expect(totals.sellerProceedsCents).toBe(18_525);
  });

  it("legacy items (shipping_option null) behave as buyer_pays", () => {
    const totals = calculateOrderTotals(
      [{ priceCents: 5000, shippingClass: "m", shippingOption: null, parcelSize: null }],
      "AUD",
    );
    expect(totals.shippingCents).toBe(1095);
    expect(totals.prepaidLabelCents).toBe(0);
    // legacy null → posted: 4% of 5000 + 50 = 250
    expect(totals.buyerProtectionFeeCents).toBe(250);
    expect(totals.totalCents).toBe(6345);
    expect(totals.sellerProceedsCents).toBe(6095 - 118);
  });

  it("free items are posted (attract the BP fee); pickup items never do", () => {
    const free = calculateOrderTotals(
      [{ priceCents: 5000, shippingClass: "s", shippingOption: "free", parcelSize: "small" }],
      "AUD",
    );
    expect(free.shippingCents).toBe(0);
    expect(free.prepaidLabelCents).toBe(0);
    expect(free.buyerProtectionFeeCents).toBe(250); // 4% of 5000 + 50
    expect(free.sellerProceedsCents).toBe(5000 - 118);
    expect(free.totalCents).toBe(5250);

    const pickup = calculateOrderTotals(
      [{ priceCents: 5000, shippingClass: "s", shippingOption: "pickup", parcelSize: "small" }],
      "AUD",
    );
    expect(pickup.shippingCents).toBe(0);
    expect(pickup.prepaidLabelCents).toBe(0);
    expect(pickup.buyerProtectionFeeCents).toBe(0);
    expect(pickup.sellerProceedsCents).toBe(5000 - 118);
    expect(pickup.totalCents).toBe(5000); // buyer pays subtotal only
  });

  it("mixed cart: buyer-side shipping only for buyer_pays; labels only for prepaid", () => {
    const totals = calculateOrderTotals(
      [
        prepaid200Medium, // no buyer shipping, 1095 label
        { priceCents: 3000, shippingClass: "s", shippingOption: "buyer_pays", parcelSize: "small" },
      ],
      "AUD",
    );
    // Only ONE buyer-pays item → base rate s=855, no multi-item surcharge
    expect(totals.shippingCents).toBe(855);
    expect(totals.prepaidLabelCents).toBe(1095);
    // fee on subtotal 23000: 402.5 → 403 + 30 = 433
    expect(totals.platformFeeCents).toBe(433);
    // both items posted → BP fee on full 23000 subtotal: 4% = 920 + 50 = 970
    expect(totals.buyerProtectionFeeCents).toBe(970);
    expect(totals.totalCents).toBe(24_825);
    expect(totals.sellerProceedsCents).toBe(23_855 - 433 - 1095);
  });

  it("mixed pickup + posted cart: BP fee is based on the posted-items subtotal only", () => {
    const totals = calculateOrderTotals(
      [
        { priceCents: 5000, shippingClass: "m", shippingOption: "pickup", parcelSize: null },
        { priceCents: 3000, shippingClass: "s", shippingOption: "buyer_pays", parcelSize: "small" },
      ],
      "AUD",
    );
    // BP fee basis excludes the pickup item's 5000: 4% of 3000 + 50 = 170
    expect(totals.buyerProtectionFeeCents).toBe(170);
  });

  it("prepaid without a parcel size falls back to the shipping-class rate", () => {
    const totals = calculateOrderTotals(
      [{ priceCents: 10_000, shippingClass: "l", shippingOption: "prepaid", parcelSize: null }],
      "AUD",
    );
    expect(totals.prepaidLabelCents).toBe(1660); // aligned l rate
  });

  it("the 30c fixed component applies once per order, not per item", () => {
    const totals = calculateOrderTotals(
      [
        { priceCents: 5000, shippingClass: "m", shippingOption: "pickup", parcelSize: null },
        { priceCents: 5000, shippingClass: "m", shippingOption: "pickup", parcelSize: null },
      ],
      "AUD",
    );
    // 10000 * 175bps = 175 + 30 = 205 (not 235)
    expect(totals.platformFeeCents).toBe(205);
  });
});

describe("Fee Model D — Buyer Protection fee (regression lock, task 8ecbbbcf)", () => {
  it("worked example (source spec §1): $50 item + $10 shipping, posted → buyer pays $62.50", () => {
    // The source handoff's literal figures use a round $10 shipping cost that
    // doesn't correspond to any real FLAT_RATE_SHIPPING_CENTS class (s=$8.55,
    // m=$10.95, l=$16.60) — verified directly against the shared fee formulas
    // instead of a specific shippingClass lookup. The BP fee is subtotal-based
    // and unaffected by which shipping figure is used.
    const itemSubtotalCents = 5000;
    const shippingCents = 1000;
    const commissionFeeCents = calcFeeCents(itemSubtotalCents);
    const buyerProtectionFeeCents = calcBuyerProtectionFeeCents(itemSubtotalCents);

    expect(commissionFeeCents).toBe(118); // 1.75% of 5000 (87.5 → 88) + 30, UNCHANGED
    expect(buyerProtectionFeeCents).toBe(250); // 4% of 5000 + 50

    const buyerTotalCents = itemSubtotalCents + shippingCents + buyerProtectionFeeCents;
    expect(buyerTotalCents).toBe(6250); // $62.50 — the spec's regression anchor

    // NOTE ON THE SPEC'S "$48.83 seller receives" FIGURE: that number describes
    // commission-only net on the item value, computed there WITHOUT rounding
    // the bps component before subtracting (50.00 - 1.175 = 48.825 → 48.83).
    // The actual (unchanged, locked) commission code rounds the bps component
    // to the nearest cent BEFORE adding the fixed 30c (Math.round(87.5) = 88),
    // giving a 118c ($1.18) fee → $48.82 net-of-commission on the item. This
    // 1-cent gap is a rounding-methodology difference in the spec's own
    // illustration, not a code bug — flagged in the PR body, not silently
    // forced to match by changing the (explicitly out-of-scope) commission code.
    const itemNetOfCommissionCents = itemSubtotalCents - commissionFeeCents;
    expect(itemNetOfCommissionCents).toBe(4882);

    // The schema's real `sellerProceedsCents` for a buyer_pays order like this
    // one additionally includes the shipping pass-through (the seller keeps
    // it to post the item themselves) — proven end-to-end, with a real
    // shipping-class rate, by the "legacy items" test above (shippingCents
    // 1095, sellerProceedsCents 5977) and the "mixed cart" test.
  });

  it("worked example: $50 item, pickup → buyer pays $50.00, no BP fee", () => {
    const totals = calculateOrderTotals(
      [{ priceCents: 5000, shippingClass: "m", shippingOption: "pickup", parcelSize: null }],
      "AUD",
    );
    expect(totals.shippingCents).toBe(0);
    expect(totals.buyerProtectionFeeCents).toBe(0);
    expect(totals.totalCents).toBe(5000);
  });

  it("no code path can charge a BP fee on a pure-pickup order, across a price sweep", () => {
    for (let priceCents = 500; priceCents <= 100_000; priceCents += 500) {
      const totals = calculateOrderTotals(
        [{ priceCents, shippingClass: "m", shippingOption: "pickup", parcelSize: null }],
        "AUD",
      );
      expect(totals.buyerProtectionFeeCents).toBe(0);
      expect(totals.totalCents).toBe(priceCents);
    }
  });

  it("posted orders scale linearly with no cap, across a $5–$1,000 price sweep", () => {
    for (let priceCents = 500; priceCents <= 100_000; priceCents += 500) {
      const totals = calculateOrderTotals(
        [{ priceCents, shippingClass: "m", shippingOption: "buyer_pays", parcelSize: null }],
        "AUD",
      );
      const expectedFee = Math.round((priceCents * 400) / 10_000) + 50;
      expect(totals.buyerProtectionFeeCents).toBe(expectedFee);
      // No cap: the fee must keep climbing above the highest bracket price ($1000 → $10.50).
      expect(totals.buyerProtectionFeeCents).toBeGreaterThan(0);
    }
    // Explicit high-end check: $1,000 item → 4% of 100000 + 50 = 4050 ($40.50), uncapped.
    const highEnd = calculateOrderTotals(
      [{ priceCents: 100_000, shippingClass: "m", shippingOption: "buyer_pays", parcelSize: null }],
      "AUD",
    );
    expect(highEnd.buyerProtectionFeeCents).toBe(4050);
  });

  it("calcBuyerProtectionFeeCents guards reject negative or non-integer input", () => {
    expect(() => calcBuyerProtectionFeeCents(-1)).toThrow();
    expect(() => calcBuyerProtectionFeeCents(50.5)).toThrow();
  });
});
