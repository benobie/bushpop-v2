import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PayoutHold, Order } from "@bushpop/types";
import { ConflictError, NotFoundError } from "./errors.js";

// ---------------------------------------------------------------------------
// Mock DB — must be hoisted before importing the service
// ---------------------------------------------------------------------------

const mockDb = {
  update: vi.fn(),
  select: vi.fn(),
  execute: vi.fn().mockResolvedValue(undefined),
  // transaction(cb) runs the callback with a tx client that proxies to mockDb
  // (update/execute/select are shared so assertions keep working).
  transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mockDb)),
};

vi.mock("@bushpop/db/client", () => ({ db: mockDb }));
vi.mock("../lib/stripe.js", () => ({
  getStripe: vi.fn(() => ({
    balance: {
      retrieve: vi.fn().mockResolvedValue({
        available: [{ currency: "aud", amount: 500_000 }],
        pending: [{ currency: "aud", amount: 100_000 }],
      }),
    },
  })),
}));

// Import AFTER mocks are registered
const {
  transitionPayoutHold,
  freezePayoutHold,
  evaluateHoldPolicy,
  isNewSeller,
  getPlatformBalance,
  getCashReserveThreshold,
} = await import("./payout-hold-service.js");

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "01JQF123456789ABCDEFGHIJK",
    checkoutSessionId: "01JQF123456789ABCDEFGHI00",
    buyerId: "buyer01",
    sellerId: "seller01",
    channelId: "channel01",
    status: "delivered",
    subtotalCents: 5000,
    shippingCents: 1000,
    platformFeeCents: 500,
    sellerProceedsCents: 5500,
    totalCents: 6000,
    currency: "AUD",
    shippingAddressSnapshot: null,
    senderAddressSnapshot: null,
    trackingNumber: "TRK123",
    trackingCarrier: "Australia Post",
    shippingLabelId: "label_01",
    shippingLabelUrl: null,
    lastTrackingStatus: null,
    lastTrackingEventAt: null,
    deliveryConfirmedAt: new Date("2026-04-01T10:00:00Z"),
    slaDeadlineAt: null,
    isInternational: false,
    jobsEnqueuedAt: null,
    stripePaymentIntentId: null,
    stripeTransferId: null,
    items: [],
    createdAt: new Date("2026-03-25T10:00:00Z"),
    updatedAt: new Date("2026-04-01T10:00:00Z"),
    ...overrides,
  };
}

function makePayoutHold(overrides: Partial<PayoutHold> = {}): PayoutHold {
  return {
    id: "hold01ABCDEFGHIJKLMNOPQRS",
    orderId: "01JQF123456789ABCDEFGHIJK",
    sellerStripeAccountId: "acct_test_seller",
    amountCents: 5500,
    currency: "AUD",
    transferId: null,
    version: 1,
    status: "held",
    frozenAt: null,
    nextRetryAt: null,
    failureReason: null,
    releaseAttempts: 0,
    fundingDeferrals: 0,
    buyerConfirmedAt: null,
    holdPolicyApplied: null,
    deliveryConfirmedAt: new Date("2026-04-01T10:00:00Z"),
    createdAt: new Date("2026-03-25T10:00:00Z"),
    updatedAt: new Date("2026-04-01T10:00:00Z"),
    ...overrides,
  };
}

function makeSellerProfile(overrides: { userId?: string; createdAt?: Date } = {}) {
  return {
    userId: "seller01",
    createdAt: new Date("2025-01-01T00:00:00Z"), // established seller
    ...overrides,
  };
}

// Build a fluent drizzle mock chain for select queries
function makeSelectChain(returnValue: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
  };
  return chain;
}

// Build a fluent drizzle mock chain for update queries
function makeUpdateChain(returnValue: unknown[] = [{ id: "hold01", version: 2 }]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returnValue),
  };
  return chain;
}

function makeUpdateNoReturning(rows = 1) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue({ rowCount: rows }),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// transitionPayoutHold
// ---------------------------------------------------------------------------

describe("transitionPayoutHold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns new version on successful CAS", async () => {
    mockDb.update.mockReturnValue(makeUpdateChain([{ id: "hold01", version: 2 }]));
    const newVersion = await transitionPayoutHold("hold01", "held", "releasing", 1);
    expect(newVersion).toBe(2);
  });

  it("throws ConflictError when version mismatch (0 rows updated)", async () => {
    mockDb.update.mockReturnValue(makeUpdateChain([]));
    await expect(
      transitionPayoutHold("hold01", "held", "releasing", 1),
    ).rejects.toThrow(ConflictError);
  });

  it("throws ConflictError for invalid transition (held → released)", async () => {
    await expect(
      transitionPayoutHold("hold01", "held", "released", 1),
    ).rejects.toThrow(ConflictError);
  });

  it("allows held → release_failed_retryable", async () => {
    mockDb.update.mockReturnValue(makeUpdateChain([{ id: "hold01", version: 2 }]));
    const v = await transitionPayoutHold("hold01", "held", "release_failed_retryable", 1);
    expect(v).toBe(2);
  });

  it("allows release_failed_retryable → releasing", async () => {
    mockDb.update.mockReturnValue(makeUpdateChain([{ id: "hold01", version: 3 }]));
    const v = await transitionPayoutHold("hold01", "release_failed_retryable", "releasing", 2);
    expect(v).toBe(3);
  });

  it("allows release_failed_retryable → release_failed_manual", async () => {
    mockDb.update.mockReturnValue(makeUpdateChain([{ id: "hold01", version: 3 }]));
    const v = await transitionPayoutHold(
      "hold01",
      "release_failed_retryable",
      "release_failed_manual",
      2,
    );
    expect(v).toBe(3);
  });

  it("merges extraSets into the update", async () => {
    const updateChain = makeUpdateChain([{ id: "hold01", version: 2 }]);
    mockDb.update.mockReturnValue(updateChain);
    await transitionPayoutHold("hold01", "held", "releasing", 1, {
      failureReason: "test",
    });
    const setArgs = updateChain.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArgs["failureReason"]).toBe("test");
    expect(setArgs["status"]).toBe("releasing");
    expect(setArgs["version"]).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// freezePayoutHold
// ---------------------------------------------------------------------------

describe("freezePayoutHold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets frozen_at when not already frozen", async () => {
    const hold = { id: "hold01", frozenAt: null };
    mockDb.select.mockReturnValue(makeSelectChain([hold]));
    const updateChain = makeUpdateNoReturning();
    mockDb.update.mockReturnValue(updateChain);

    await freezePayoutHold("order01", "refund");

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ frozenAt: expect.any(Date) }),
    );
  });

  it("is idempotent — does not update when already frozen", async () => {
    const hold = { id: "hold01", frozenAt: new Date("2026-04-01T10:00:00Z") };
    mockDb.select.mockReturnValue(makeSelectChain([hold]));

    await freezePayoutHold("order01", "refund");

    // update should NOT have been called
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when no hold exists for orderId", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));

    await expect(freezePayoutHold("order01", "refund")).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// evaluateHoldPolicy
// ---------------------------------------------------------------------------

describe("evaluateHoldPolicy", () => {
  const deliveredAt = new Date("2026-04-01T10:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockIsNewSeller(isNew: boolean) {
    // isNewSeller makes two db.select calls: one for profile, one for count
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    if (isNew) {
      // Return a new profile (created recently)
      mockDb.select.mockReturnValueOnce(
        makeSelectChain([{ createdAt: new Date() }]),
      );
    } else {
      // Established profile with >= 5 completed orders
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([{ createdAt: new Date("2025-01-01T00:00:00Z") }]))
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([{ completedCount: 10 }]),
        });
    }
  }

  it("returns buyer_confirmed immediately when buyerConfirmedAt is set", async () => {
    const confirmedAt = new Date("2026-04-02T08:00:00Z");
    const hold = makePayoutHold({ buyerConfirmedAt: confirmedAt });
    const order = makeOrder({ deliveryConfirmedAt: deliveredAt });

    const result = await evaluateHoldPolicy(order, makeSellerProfile(), hold);

    expect(result.policyName).toBe("buyer_confirmed");
    expect(result.releaseEligibleAt).toEqual(confirmedAt);
  });

  it("returns new_seller_7d for a new seller with tracking", async () => {
    mockIsNewSeller(true);
    const hold = makePayoutHold();
    const order = makeOrder({ deliveryConfirmedAt: deliveredAt, trackingNumber: "TRK123" });

    const result = await evaluateHoldPolicy(order, makeSellerProfile(), hold);

    expect(result.policyName).toBe("new_seller_7d");
    const expected = new Date(deliveredAt);
    expected.setDate(expected.getDate() + 7);
    expect(result.releaseEligibleAt).toEqual(expected);
  });

  it("returns tracked_3d for an established seller with tracking", async () => {
    mockIsNewSeller(false);
    const hold = makePayoutHold();
    const order = makeOrder({ deliveryConfirmedAt: deliveredAt, trackingNumber: "TRK123" });

    const result = await evaluateHoldPolicy(order, makeSellerProfile(), hold);

    expect(result.policyName).toBe("tracked_3d");
    const expected = new Date(deliveredAt);
    expected.setDate(expected.getDate() + 3);
    expect(result.releaseEligibleAt).toEqual(expected);
  });

  it("returns untracked_10bd for an established seller with no tracking", async () => {
    mockIsNewSeller(false);
    const hold = makePayoutHold();
    const order = makeOrder({
      deliveryConfirmedAt: deliveredAt,
      trackingNumber: null,
      shippingLabelId: null,
    });

    const result = await evaluateHoldPolicy(order, makeSellerProfile(), hold);

    expect(result.policyName).toBe("untracked_10bd");
    const expected = new Date(deliveredAt);
    expected.setDate(expected.getDate() + 14);
    expect(result.releaseEligibleAt).toEqual(expected);
  });

  it("uses payoutHold.deliveryConfirmedAt when order.deliveryConfirmedAt is null", async () => {
    mockIsNewSeller(false);
    const holdDeliveredAt = new Date("2026-04-02T10:00:00Z");
    const hold = makePayoutHold({ deliveryConfirmedAt: holdDeliveredAt });
    const order = makeOrder({ deliveryConfirmedAt: null, trackingNumber: "TRK123" });

    const result = await evaluateHoldPolicy(order, makeSellerProfile(), hold);

    expect(result.policyName).toBe("tracked_3d");
    const expected = new Date(holdDeliveredAt);
    expected.setDate(expected.getDate() + 3);
    expect(result.releaseEligibleAt).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// isNewSeller
// ---------------------------------------------------------------------------

describe("isNewSeller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when no profile exists", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    expect(await isNewSeller("seller01")).toBe(true);
  });

  it("returns true when profile is less than 30 days old", async () => {
    mockDb.select.mockReturnValue(
      makeSelectChain([{ createdAt: new Date() }]),
    );
    expect(await isNewSeller("seller01")).toBe(true);
  });

  it("returns true when profile is old but fewer than 5 completed orders", async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ createdAt: new Date("2025-01-01T00:00:00Z") }]))
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ completedCount: 3 }]),
      });
    expect(await isNewSeller("seller01")).toBe(true);
  });

  it("returns false for established seller with >= 5 completed orders", async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ createdAt: new Date("2025-01-01T00:00:00Z") }]))
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ completedCount: 10 }]),
      });
    expect(await isNewSeller("seller01")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPlatformBalance
// ---------------------------------------------------------------------------

describe("getPlatformBalance", () => {
  it("returns AUD available and pending cents from Stripe", async () => {
    const result = await getPlatformBalance();
    expect(result.availableCents).toBe(500_000);
    expect(result.pendingCents).toBe(100_000);
  });
});

// ---------------------------------------------------------------------------
// getCashReserveThreshold
// ---------------------------------------------------------------------------

describe("getCashReserveThreshold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns minimum of 50_000 when no recent orders exist", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ highest: null }]),
    });
    const threshold = await getCashReserveThreshold();
    expect(threshold).toBe(50_000);
  });

  it("returns 2x highest order when above minimum", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ highest: 60_000 }]),
    });
    const threshold = await getCashReserveThreshold();
    expect(threshold).toBe(120_000); // 2 * 60_000
  });

  it("respects the 50_000 floor when highest order is below 25_000", async () => {
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ highest: 10_000 }]),
    });
    const threshold = await getCashReserveThreshold();
    expect(threshold).toBe(50_000); // max(50_000, 2*10_000=20_000) = 50_000
  });

  it("queries recent orders using gt (not lt) for the date filter", async () => {
    // Regression test: previously used lt() which queried OLD orders instead of recent ones.
    // We verify by reading the source — the mock DB can't distinguish gt vs lt.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("./payout-hold-service.ts", import.meta.url),
      "utf-8",
    );
    // The getCashReserveThreshold function should use gt() not lt() for the date filter
    const fnMatch = source.match(
      /getCashReserveThreshold[\s\S]*?\.where\((.*?)\)/,
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toContain("gt(");
    expect(fnMatch![1]).not.toContain("lt(");
  });
});
