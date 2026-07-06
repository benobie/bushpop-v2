import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { checkoutSessions, orders, payoutHolds, addresses, sellerProfiles } from "@bushpop/db/schema";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { authedRequest } from "../../helpers/http.js";
import { createStripeReadySeller } from "../../helpers/stripe-mock.js";

vi.mock("../../../lib/stripe.js", () => {
  const mockPaymentIntent = {
    id: "pi_test_mock_payouts",
    client_secret: "pi_test_mock_payouts_secret",
    status: "requires_payment_method",
    amount: 0,
    currency: "aud",
    transfer_group: null,
    metadata: {},
  };
  return {
    getStripe: vi.fn(() => ({
      paymentIntents: { create: vi.fn().mockResolvedValue(mockPaymentIntent) },
    })),
    _resetStripe: vi.fn(),
  };
});

async function createBuyerAddress(buyerId: string): Promise<string> {
  const [addr] = await db
    .insert(addresses)
    .values({
      userId: buyerId,
      line1: "1 Buyer Street",
      suburb: "Sydney",
      state: "NSW",
      postcode: "2000",
      country: "AU",
    })
    .returning();
  return addr!.id;
}

async function setupSellerWithStripe(sellerId: string) {
  await db
    .update(sellerProfiles)
    .set({ stripeChargesEnabled: true, stripePayoutsEnabled: true })
    .where(eq(sellerProfiles.userId, sellerId));
}

/** Creates a paid order + payout hold for a seller, bypassing the webhook. */
async function createOrderWithPayoutHold(
  sellerId: string,
  buyerToken: string,
  buyerId: string,
  opts: { amountCents: number; payoutStatus?: string },
) {
  const listing = await createActiveTestListing(sellerId, { priceCents: opts.amountCents });

  await authedRequest(buyerToken, "POST", "/api/v1/store/cart/items", { listingId: listing.id });
  const addressId = await createBuyerAddress(buyerId);
  const checkoutRes = await authedRequest(buyerToken, "POST", "/api/v1/store/checkout", {
    shippingAddressId: addressId,
  });
  expect(checkoutRes.statusCode).toBe(200);
  const sessionId = checkoutRes.json().sessionId as string;

  const [session] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, sessionId));

  const [order] = await db
    .insert(orders)
    .values({
      checkoutSessionId: sessionId,
      buyerId,
      sellerId,
      channelId: session!.channelId,
      status: "paid",
      subtotalCents: opts.amountCents,
      shippingCents: 0,
      platformFeeCents: 0,
      sellerProceedsCents: opts.amountCents,
      totalCents: opts.amountCents,
      currency: "AUD",
      stripePaymentIntentId: "pi_test_mock_payouts",
    })
    .returning();

  await db.insert(payoutHolds).values({
    orderId: order!.id,
    sellerStripeAccountId: "acct_test_seller",
    amountCents: opts.amountCents,
    currency: "AUD",
    status: opts.payoutStatus ?? "held",
  });

  return order!;
}

describe("GET /api/v1/seller/payouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only returns the caller's own payout holds — a seller cannot see another seller's payouts", async () => {
    const sellerA = await signUpTestUser();
    await grantSellerRole(sellerA.user.id, { withDefaultAddress: true });
    await setupSellerWithStripe(sellerA.user.id);
    await createStripeReadySeller(sellerA.user.id);

    const sellerB = await signUpTestUser();
    await grantSellerRole(sellerB.user.id, { withDefaultAddress: true });
    await setupSellerWithStripe(sellerB.user.id);
    await createStripeReadySeller(sellerB.user.id);

    const buyerA = await signUpTestUser();
    const buyerB = await signUpTestUser();

    const orderA = await createOrderWithPayoutHold(sellerA.user.id, buyerA.sessionToken, buyerA.user.id, {
      amountCents: 4000,
    });
    const orderB = await createOrderWithPayoutHold(sellerB.user.id, buyerB.sessionToken, buyerB.user.id, {
      amountCents: 9000,
    });

    const resA = await authedRequest(sellerA.sessionToken, "GET", "/api/v1/seller/payouts");
    expect(resA.statusCode).toBe(200);
    const bodyA = resA.json();
    expect(bodyA.items).toHaveLength(1);
    expect(bodyA.items[0].orderId).toBe(orderA.id);
    expect(bodyA.items.find((i: { orderId: string }) => i.orderId === orderB.id)).toBeUndefined();

    const resB = await authedRequest(sellerB.sessionToken, "GET", "/api/v1/seller/payouts");
    expect(resB.statusCode).toBe(200);
    const bodyB = resB.json();
    expect(bodyB.items).toHaveLength(1);
    expect(bodyB.items[0].orderId).toBe(orderB.id);
  });

  it("returns the exact engine-stored amount and status — no client/route-side arithmetic", async () => {
    const seller = await signUpTestUser();
    await grantSellerRole(seller.user.id, { withDefaultAddress: true });
    await setupSellerWithStripe(seller.user.id);
    await createStripeReadySeller(seller.user.id);

    const buyer = await signUpTestUser();

    const order = await createOrderWithPayoutHold(seller.user.id, buyer.sessionToken, buyer.user.id, {
      amountCents: 6125,
      payoutStatus: "released",
    });

    const res = await authedRequest(seller.sessionToken, "GET", "/api/v1/seller/payouts");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      orderId: order.id,
      amountCents: 6125,
      currency: "AUD",
      status: "released",
    });
    expect(body.totalsByStatus).toContainEqual({ status: "released", totalCents: 6125 });
  });

  it("returns 403 for a non-seller caller", async () => {
    const buyer = await signUpTestUser();
    const res = await authedRequest(buyer.sessionToken, "GET", "/api/v1/seller/payouts");
    expect(res.statusCode).toBe(403);
  });

  it("returns 401 for an unauthenticated caller", async () => {
    const { publicRequest } = await import("../../helpers/http.js");
    const res = await publicRequest("GET", "/api/v1/seller/payouts");
    expect(res.statusCode).toBe(401);
  });
});
