import { describe, it, expect, vi, beforeEach } from "vitest";
import { ulid } from "ulid";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  carts,
  checkoutSessions,
  user,
} from "@bushpop/db/schema";
import { getPikloChannel } from "../../../../test/helpers/get-channel.js";

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports to allow vi.mock hoisting
// ---------------------------------------------------------------------------

vi.mock("../../../../lib/stripe.js");

// Force the refund branch by making re-reservation fail (empty status list +
// reserve throws). The default `getInventoryStatuses` returning an empty array
// would otherwise take the reactivated path because `[].every(...)` is true.
vi.mock("../../../../lib/inventory-reservation.js", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../../../../lib/inventory-reservation.js")
  >();
  return {
    ...original,
    getInventoryStatuses: vi.fn().mockResolvedValue([
      { id: "fake-item-id", version: 1, availabilityStatus: "sold" },
    ]),
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { getStripe } from "../../../../lib/stripe.js";
import { handlePaymentAfterExpiry } from "./service.js";

// ---------------------------------------------------------------------------
// Stripe mock builders
// ---------------------------------------------------------------------------

interface StripeMockOptions {
  latestChargeId?: string;
  charge?: {
    transfer_data?: { destination: string } | null;
    application_fee_amount?: number | null;
  };
}

function buildStripeMock(options: StripeMockOptions = {}) {
  const refundCreate = vi.fn().mockResolvedValue({
    id: "re_test_mock",
    object: "refund",
    status: "succeeded",
  });

  const paymentIntentRetrieve = vi.fn().mockResolvedValue({
    id: "pi_test_123",
    latest_charge: options.latestChargeId ?? "ch_test_123",
  });

  const chargeRetrieve = vi.fn().mockResolvedValue({
    id: options.latestChargeId ?? "ch_test_123",
    transfer_data: options.charge?.transfer_data ?? null,
    application_fee_amount: options.charge?.application_fee_amount ?? null,
  });

  const stripe = {
    refunds: { create: refundCreate },
    paymentIntents: { retrieve: paymentIntentRetrieve },
    charges: { retrieve: chargeRetrieve },
  } as unknown as ReturnType<typeof getStripe>;

  vi.mocked(getStripe).mockReturnValue(stripe);

  return { refundCreate, paymentIntentRetrieve, chargeRetrieve };
}

// ---------------------------------------------------------------------------
// DB fixture
// ---------------------------------------------------------------------------

async function createExpiredSession(): Promise<{ sessionId: string; pi: string }> {
  const channel = await getPikloChannel();
  const buyerId = ulid();
  const sellerId = ulid();
  const cartId = ulid();
  const sessionId = ulid();
  const pi = `pi_test_${sessionId.toLowerCase()}`;

  await db.insert(user).values({
    id: buyerId,
    name: "LB-F7 Buyer",
    email: `buyer-${buyerId.toLowerCase()}@example.com`,
    emailVerified: true,
  });
  await db.insert(user).values({
    id: sellerId,
    name: "LB-F7 Seller",
    email: `seller-${sellerId.toLowerCase()}@example.com`,
    emailVerified: true,
  });

  await db.insert(carts).values({
    id: cartId,
    buyerId,
    channelId: channel.id,
  });

  await db.insert(checkoutSessions).values({
    id: sessionId,
    cartId,
    buyerId,
    channelId: channel.id,
    status: "expired",
    subtotalCents: 5000,
    shippingCents: 1000,
    platformFeeCents: 500,
    sellerProceedsCents: 5500,
    totalCents: 6000,
    currency: "AUD",
    stripePaymentIntentId: pi,
  });

  return { sessionId, pi };
}

// ---------------------------------------------------------------------------
// LB-F7-REFUND-FLAGS tests
// ---------------------------------------------------------------------------

describe("handlePaymentAfterExpiry — LB-F7-REFUND-FLAGS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes reverse_transfer + refund_application_fee for destination charges", async () => {
    const { sessionId, pi } = await createExpiredSession();

    const { refundCreate } = buildStripeMock({
      charge: {
        transfer_data: { destination: "acct_test_seller" },
        application_fee_amount: 500,
      },
    });

    const result = await handlePaymentAfterExpiry(sessionId, pi);

    expect(result).toBe("refunded");
    expect(refundCreate).toHaveBeenCalledTimes(1);

    const refundArgs = refundCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(refundArgs["payment_intent"]).toBe(pi);
    expect(refundArgs["reverse_transfer"]).toBe(true);
    expect(refundArgs["refund_application_fee"]).toBe(true);
    expect(refundArgs["reason"]).toBe("requested_by_customer");
    const metadata = refundArgs["metadata"] as Record<string, string>;
    expect(metadata["piklo_reason"]).toBe("late_success_recovery");
    expect(metadata["checkout_session_id"]).toBe(sessionId);

    // Session transitioned to refunded_after_expiry
    const [session] = await db
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, sessionId));
    expect(session!.status).toBe("refunded_after_expiry");
  });

  it("falls back to plain refund for non-Connect charges (no transfer_data)", async () => {
    const { sessionId, pi } = await createExpiredSession();

    const { refundCreate } = buildStripeMock({
      charge: {
        transfer_data: null,
        application_fee_amount: null,
      },
    });

    await handlePaymentAfterExpiry(sessionId, pi);

    expect(refundCreate).toHaveBeenCalledTimes(1);
    const refundArgs = refundCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(refundArgs["payment_intent"]).toBe(pi);
    expect(refundArgs["reverse_transfer"]).toBeUndefined();
    expect(refundArgs["refund_application_fee"]).toBeUndefined();
    // Still passes reason + metadata for ops traceability
    expect(refundArgs["reason"]).toBe("requested_by_customer");
  });

  it("still reverses the transfer when application_fee_amount is 0 (zero-fee destination charge)", async () => {
    // A destination charge with a zero application fee STILL needs
    // reverse_transfer:true — the seller already received the transfer, and
    // without the flag the platform eats the full refund as negative balance.
    // refund_application_fee must NOT be passed (no fee exists, Stripe would
    // error with application_fee_not_found).
    const { sessionId, pi } = await createExpiredSession();

    const { refundCreate } = buildStripeMock({
      charge: {
        transfer_data: { destination: "acct_test_seller" },
        application_fee_amount: 0,
      },
    });

    await handlePaymentAfterExpiry(sessionId, pi);

    const refundArgs = refundCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(refundArgs["reverse_transfer"]).toBe(true);
    expect(refundArgs["refund_application_fee"]).toBeUndefined();
  });

  it("handles an expanded latest_charge object (not just string id)", async () => {
    const { sessionId, pi } = await createExpiredSession();

    // Build a custom stripe mock where latest_charge is an expanded object
    // instead of a string id — mirrors what Stripe returns when the caller
    // requests `expand: ['latest_charge']`.
    const refundCreate = vi.fn().mockResolvedValue({
      id: "re_test_expanded",
      object: "refund",
      status: "succeeded",
    });
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: "pi_test_expanded",
      latest_charge: { id: "ch_test_expanded", object: "charge" },
    });
    const chargeRetrieve = vi.fn().mockResolvedValue({
      id: "ch_test_expanded",
      transfer_data: { destination: "acct_test_seller" },
      application_fee_amount: 500,
    });
    vi.mocked(getStripe).mockReturnValue({
      refunds: { create: refundCreate },
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargeRetrieve },
    } as unknown as ReturnType<typeof getStripe>);

    await handlePaymentAfterExpiry(sessionId, pi);

    // chargeRetrieve should be called with the id extracted from the object
    expect(chargeRetrieve).toHaveBeenCalledWith("ch_test_expanded");
    const refundArgs = refundCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(refundArgs["reverse_transfer"]).toBe(true);
    expect(refundArgs["refund_application_fee"]).toBe(true);
  });

  it("falls back to plain refund when PaymentIntent has no latest_charge", async () => {
    // Edge case: a PaymentIntent can reach this path before a charge exists
    // (e.g. requires_action that transitioned mid-flow). We should not call
    // charges.retrieve at all, and the refund should be minimal.
    const { sessionId, pi } = await createExpiredSession();

    const refundCreate = vi.fn().mockResolvedValue({
      id: "re_test_no_charge",
      object: "refund",
      status: "succeeded",
    });
    const paymentIntentRetrieve = vi.fn().mockResolvedValue({
      id: "pi_test_no_charge",
      latest_charge: null,
    });
    const chargeRetrieve = vi.fn();
    vi.mocked(getStripe).mockReturnValue({
      refunds: { create: refundCreate },
      paymentIntents: { retrieve: paymentIntentRetrieve },
      charges: { retrieve: chargeRetrieve },
    } as unknown as ReturnType<typeof getStripe>);

    await handlePaymentAfterExpiry(sessionId, pi);

    expect(chargeRetrieve).not.toHaveBeenCalled();
    const refundArgs = refundCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(refundArgs["reverse_transfer"]).toBeUndefined();
    expect(refundArgs["refund_application_fee"]).toBeUndefined();
  });
});
