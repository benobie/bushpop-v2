import { describe, it, expect } from "vitest";
import { orderResponseSchema } from "../../routes/v1/store/orders/schemas.js";
import { sellerOrderResponseSchema } from "../../routes/v1/seller/orders/schemas.js";
import { totalsSchema } from "../../routes/v1/store/checkout/schemas.js";

// Buyer-facing responses must not disclose the seller's net proceeds or the
// platform's cut. These schemas ARE the wire contract: Fastify's Zod serializer
// strips any key the response schema does not declare, so parsing here models
// exactly what reaches the client.

const SELLER_ONLY_FIELDS = ["platformFeeCents", "sellerProceedsCents"] as const;

const orderRow = {
  id: "01HZZZZZZZZZZZZZZZZZZZZZZZ",
  checkoutSessionId: "01HZZZZZZZZZZZZZZZZZZZZZZC",
  buyerId: "01HZZZZZZZZZZZZZZZZZZZZZZA",
  sellerId: "01HZZZZZZZZZZZZZZZZZZZZZZB",
  channelId: "01HZZZZZZZZZZZZZZZZZZZZZZD",
  status: "paid",
  subtotalCents: 5000,
  shippingCents: 1000,
  buyerProtectionFeeCents: 250,
  totalCents: 6250,
  currency: "AUD",
  shippingAddressSnapshot: null,
  senderAddressSnapshot: null,
  trackingNumber: null,
  trackingCarrier: null,
  stripePaymentIntentId: null,
  items: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  // The service layer still computes these — the schema is what withholds them.
  platformFeeCents: 500,
  sellerProceedsCents: 5500,
};

describe("buyer-facing response schemas withhold seller economics", () => {
  it("orderResponseSchema strips platformFeeCents and sellerProceedsCents", () => {
    const parsed = orderResponseSchema.parse(orderRow);

    for (const field of SELLER_ONLY_FIELDS) {
      expect(parsed).not.toHaveProperty(field);
    }
    // The buyer still gets everything they paid.
    expect(parsed).toMatchObject({
      subtotalCents: 5000,
      shippingCents: 1000,
      buyerProtectionFeeCents: 250,
      totalCents: 6250,
    });
  });

  it("checkout totalsSchema strips platformFeeCents and sellerProceedsCents", () => {
    const parsed = totalsSchema.parse({
      subtotalCents: 5000,
      shippingCents: 1000,
      buyerProtectionFeeCents: 250,
      totalCents: 6250,
      currency: "AUD",
      platformFeeCents: 500,
      sellerProceedsCents: 5500,
    });

    for (const field of SELLER_ONLY_FIELDS) {
      expect(parsed).not.toHaveProperty(field);
    }
    expect(parsed.totalCents).toBe(6250);
  });

  it("sellerOrderResponseSchema still exposes the seller's own payout breakdown", () => {
    const parsed = sellerOrderResponseSchema.parse({ ...orderRow, shippingLabelUrl: null });

    expect(parsed.platformFeeCents).toBe(500);
    expect(parsed.sellerProceedsCents).toBe(5500);
  });

  it("sellerOrderResponseSchema rejects a payload missing the payout breakdown", () => {
    const { platformFeeCents: _p, sellerProceedsCents: _s, ...withoutPayout } = orderRow;

    const result = sellerOrderResponseSchema.safeParse({
      ...withoutPayout,
      shippingLabelUrl: null,
    });

    expect(result.success).toBe(false);
  });
});
