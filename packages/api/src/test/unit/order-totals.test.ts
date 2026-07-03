import { describe, expect, it } from "vitest";
import { calculateOrderTotals } from "../../lib/order-totals.js";

const prepaid200Medium = {
  priceCents: 20_000,
  shippingClass: "m",
  shippingOption: "prepaid",
  parcelSize: "medium",
};

describe("calculateOrderTotals (shared money math)", () => {
  it("acceptance: $200 Medium prepaid → payout exactly $185.25", () => {
    const totals = calculateOrderTotals([prepaid200Medium], "AUD");
    expect(totals.platformFeeCents).toBe(380);
    expect(totals.prepaidLabelCents).toBe(1095);
    expect(totals.shippingCents).toBe(0);
    expect(totals.totalCents).toBe(20_000);
    expect(totals.sellerProceedsCents).toBe(18_525);
  });

  it("legacy items (shipping_option null) behave as buyer_pays", () => {
    const totals = calculateOrderTotals(
      [{ priceCents: 5000, shippingClass: "m", shippingOption: null, parcelSize: null }],
      "AUD",
    );
    expect(totals.shippingCents).toBe(1095);
    expect(totals.prepaidLabelCents).toBe(0);
    expect(totals.totalCents).toBe(6095);
    expect(totals.sellerProceedsCents).toBe(6095 - 118);
  });

  it("free and pickup items cost the buyer nothing and deduct nothing", () => {
    for (const option of ["free", "pickup"]) {
      const totals = calculateOrderTotals(
        [{ priceCents: 5000, shippingClass: "s", shippingOption: option, parcelSize: "small" }],
        "AUD",
      );
      expect(totals.shippingCents).toBe(0);
      expect(totals.prepaidLabelCents).toBe(0);
      expect(totals.sellerProceedsCents).toBe(5000 - 118);
    }
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
    expect(totals.totalCents).toBe(23_855);
    expect(totals.sellerProceedsCents).toBe(23_855 - 433 - 1095);
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
