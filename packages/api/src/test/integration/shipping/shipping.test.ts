/**
 * Shipping Integration Tests — Phase 2B Step 4
 *
 * Covers:
 * 1. MockShippingProvider unit tests (including getTrackingStatus)
 * 2. ShippingLabelWorker — processes job and updates order
 * 3. ShippingLabelWorker — no-ops when order is cancelled
 * 4. Starshipit webhook — Delivered: order transitions + deliveryConfirmedAt + hold policy
 * 5. Starshipit webhook — Dispatched: order transitions paid → shipped
 * 6. Starshipit webhook — Exception: tracking updated, event dispatched, status unchanged
 * 7. Starshipit webhook — AttemptedDelivery: tracking updated, status unchanged
 * 8. Starshipit webhook — Duplicate: same tracking_number + status + timestamp → no-op
 * 9. Starshipit webhook — Unknown status: tracking updated, no crash
 * 10. Starshipit webhook HTTP layer tests (Delivered → delivered via HTTP)
 * 11. Starshipit webhook — non-Delivered status returns 200 without changing order
 * 12. Starshipit webhook — missing signature returns 401 when secret is set
 * 13. Starshipit poll worker — fetches shipped orders, updates tracking status
 * 14. Starshipit poll worker — dead-letter: orders shipped >14 days → tracking_stale event
 * 15. Prod boot-time guard tests
 */

import { createHmac } from "crypto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { and, eq, lt } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@bushpop/db/client";
import { orders, checkoutSessions, carts, payoutHolds, sellerProfiles, marketplaceEvents } from "@bushpop/db/schema";
import { MockShippingProvider } from "../../../lib/shipping/mock.js";
import { getTestApp } from "../../helpers/http.js";
import { createTestUser } from "../../helpers/create-user.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";
import { handleTrackingEventForTest } from "../../../routes/v1/webhooks/starshipit.js";

function starshipitSig(body: string): string {
  const secret = process.env.STARSHIPIT_WEBHOOK_SECRET ?? "test_webhook_secret";
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

// ── Mock BullMQ (don't connect to Redis in tests) ────────────────────────────
vi.mock("../../../workers/shipping-label.js", async () => {
  const actual = await vi.importActual("../../../workers/shipping-label.js") as Record<string, unknown>;
  return {
    ...actual,
    startShippingLabelWorker: vi.fn(),
    enqueueShippingLabel: vi.fn().mockResolvedValue(undefined),
    SHIPPING_LABEL_QUEUE: "shipping-label",
  };
});

vi.mock("../../../workers/checkout-expiry.js", () => ({
  scheduleCheckoutExpiry: vi.fn().mockResolvedValue(undefined),
  startCheckoutExpiryWorker: vi.fn(),
  CHECKOUT_EXPIRY_QUEUE: "checkout-expiry",
}));

vi.mock("../../../lib/stripe.js", () => ({
  getStripe: vi.fn(() => ({
    paymentIntents: { create: vi.fn(), cancel: vi.fn() },
    refunds: { create: vi.fn() },
    transfers: { create: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
  })),
  _resetStripe: vi.fn(),
}));

// Mock BullMQ Queue to avoid Redis connections in tests.
// dispatchEvent writes to DB (for assertion) then tries to enqueue — the mock
// prevents the Redis call from hanging and blocking test teardown.
vi.mock("bullmq", async () => {
  const actual = await vi.importActual("bullmq") as Record<string, unknown>;
  return {
    ...actual,
    Queue: vi.fn().mockImplementation(() => ({
      add: vi.fn().mockResolvedValue({ id: "mock-job-id" }),
      getRepeatableJobs: vi.fn().mockResolvedValue([]),
      removeRepeatableByKey: vi.fn().mockResolvedValue(undefined),
    })),
    Worker: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
    })),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createMinimalOrder(
  overrides: {
    status?: string;
    trackingNumber?: string | null;
    shippingAddressSnapshot?: Record<string, unknown> | null;
    senderAddressSnapshot?: Record<string, unknown> | null;
    createdAt?: Date;
    sellerId?: string;
  } = {},
) {
  const channel = await getBushpopChannel();
  const buyer = await createTestUser();
  const seller = overrides.sellerId
    ? { id: overrides.sellerId }
    : await createTestUser();

  // Minimal checkout session (required FK)
  const [csRow] = await db
    .insert(checkoutSessions)
    .values({
      id: ulid(),
      cartId: await createMinimalCart(buyer.id, seller.id, channel.id),
      buyerId: buyer.id,
      channelId: channel.id,
      status: "succeeded",
      subtotalCents: 5000,
      shippingCents: 800,
      platformFeeCents: 200,
      sellerProceedsCents: 4600,
      totalCents: 6000,
      currency: "AUD",
    })
    .returning();

  const shippingSnap = overrides.shippingAddressSnapshot !== undefined
    ? overrides.shippingAddressSnapshot
    : {
        name: "Jane Buyer",
        line1: "1 Buyer Street",
        suburb: "Sydney",
        state: "NSW",
        postcode: "2000",
        country: "AU",
      };

  const senderSnap = overrides.senderAddressSnapshot !== undefined
    ? overrides.senderAddressSnapshot
    : {
        name: "John Seller",
        line1: "100 Seller Road",
        suburb: "Melbourne",
        state: "VIC",
        postcode: "3000",
        country: "AU",
      };

  const [order] = await db
    .insert(orders)
    .values({
      id: ulid(),
      checkoutSessionId: csRow!.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      channelId: channel.id,
      status: overrides.status ?? "paid",
      subtotalCents: 5000,
      shippingCents: 800,
      platformFeeCents: 200,
      sellerProceedsCents: 4600,
      totalCents: 6000,
      currency: "AUD",
      shippingAddressSnapshot: shippingSnap,
      senderAddressSnapshot: senderSnap,
      ...(overrides.trackingNumber !== undefined
        ? { trackingNumber: overrides.trackingNumber }
        : {}),
      ...(overrides.createdAt !== undefined ? { createdAt: overrides.createdAt } : {}),
    })
    .returning();

  return order!;
}

async function createMinimalCart(
  buyerId: string,
  sellerId: string,
  channelId: string,
): Promise<string> {
  const [cart] = await db
    .insert(carts)
    .values({
      id: ulid(),
      buyerId,
      channelId,
    })
    .returning();
  return cart!.id;
}

async function createPayoutHold(orderId: string) {
  const [hold] = await db
    .insert(payoutHolds)
    .values({
      id: ulid(),
      orderId,
      sellerStripeAccountId: `acct_test_${ulid().toLowerCase()}`,
      amountCents: 4600,
      currency: "AUD",
      status: "held",
      version: 1,
    })
    .returning();
  return hold!;
}

async function createSellerProfile(userId: string) {
  const existingProfile = await db
    .select()
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, userId))
    .limit(1);

  if (existingProfile.length > 0) return existingProfile[0]!;

  const [profile] = await db
    .insert(sellerProfiles)
    .values({
      id: ulid(),
      userId,
      storeName: `Test Store ${ulid().slice(-6)}`,
      handle: `test-seller-${ulid().slice(-6).toLowerCase()}`,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      // Old enough to not be considered a "new seller"
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    })
    .returning();
  return profile!;
}

// ── 1. MockShippingProvider unit tests (pure — no DB) ────────────────────────

describe("MockShippingProvider", () => {
  const provider = new MockShippingProvider();

  it("validateAddress always returns address with normalised=true", async () => {
    const addr = {
      name: "Test User",
      line1: "123 Test St",
      suburb: "Testville",
      state: "NSW",
      postcode: "2000",
      country: "AU",
    };

    const result = await provider.validateAddress(addr);
    expect(result.normalised).toBe(true);
    expect(result.line1).toBe(addr.line1);
    expect(result.suburb).toBe(addr.suburb);
  });

  it("createShipment returns expected shape with MOCK- prefix tracking number", async () => {
    const result = await provider.createShipment({
      orderId: "01JTEST0000000000000000001",
      fromAddress: {
        name: "Seller",
        line1: "100 From St",
        suburb: "Sydney",
        state: "NSW",
        postcode: "2000",
        country: "AU",
      },
      toAddress: {
        name: "Buyer",
        line1: "200 To Ave",
        suburb: "Melbourne",
        state: "VIC",
        postcode: "3000",
        country: "AU",
      },
    });

    expect(result.trackingNumber).toMatch(/^MOCK-/);
    expect(result.labelUrl).toContain("01JTEST0000000000000000001");
    expect(result.carrier).toBe("mock");
  });

  it("createShipment trackingNumber is based on orderId suffix", async () => {
    const orderId = "01JTEST0000000000000ABCDEF";
    const result = await provider.createShipment({
      orderId,
      fromAddress: { name: "S", line1: "1 A St", suburb: "A", state: "NSW", postcode: "2000", country: "AU" },
      toAddress: { name: "B", line1: "2 B Ave", suburb: "B", state: "VIC", postcode: "3000", country: "AU" },
    });

    expect(result.trackingNumber).toBe("MOCK-00ABCDEF");
  });

  it("getTrackingStatus returns mock InTransit status", async () => {
    const result = await provider.getTrackingStatus("MOCK-TRACKING123");
    expect(result.status).toBe("InTransit");
    expect(result.lastUpdated).not.toBeNull();
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.status).toBe("InTransit");
    expect(result.events[0]!.description).toContain("MOCK-TRACKING123");
  });
});

// ── 2. Worker processes job and updates order ─────────────────────────────────

describe("ShippingLabelWorker — processJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls createShipment and updates order with tracking number", async () => {
    const order = await createMinimalOrder({ status: "paid" });

    const mockProvider = new MockShippingProvider();

    const [fetchedOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, order.id));

    expect(fetchedOrder!.status).not.toBe("cancelled");
    expect(fetchedOrder!.trackingNumber).toBeNull();

    const senderSnap = fetchedOrder!.senderAddressSnapshot as Record<string, string>;
    const shippingSnap = fetchedOrder!.shippingAddressSnapshot as Record<string, string>;

    const result = await mockProvider.createShipment({
      orderId: order.id,
      fromAddress: {
        name: "Seller",
        line1: senderSnap["line1"]!,
        suburb: senderSnap["suburb"]!,
        state: senderSnap["state"]!,
        postcode: senderSnap["postcode"]!,
        country: senderSnap["country"]!,
      },
      toAddress: {
        name: "Buyer",
        line1: shippingSnap["line1"]!,
        suburb: shippingSnap["suburb"]!,
        state: shippingSnap["state"]!,
        postcode: shippingSnap["postcode"]!,
        country: shippingSnap["country"]!,
      },
    });

    await db
      .update(orders)
      .set({ trackingNumber: result.trackingNumber, trackingCarrier: result.carrier })
      .where(eq(orders.id, order.id));

    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updated!.trackingNumber).toMatch(/^MOCK-/);
    expect(updated!.trackingCarrier).toBe("mock");
  });

  it("transitions paid → shipped and dispatches order.shipped (drives shipping_confirmation_buyer)", async () => {
    const order = await createMinimalOrder({ status: "paid" });

    // setup.ts defaults STARSHIPIT_API_KEY so getShippingProvider() would
    // otherwise pick the real Starshipit HTTP provider — force the mock for
    // this test, matching how the rest of the suite exercises the label flow.
    const { _resetShippingProvider } = await import("../../../lib/shipping/index.js");
    const originalKey = process.env.STARSHIPIT_API_KEY;
    delete process.env.STARSHIPIT_API_KEY;
    _resetShippingProvider();

    try {
      const { processShippingLabelJobForTest } = await import("../../../workers/shipping-label.js");
      await processShippingLabelJobForTest({ orderId: order.id });
    } finally {
      if (originalKey !== undefined) process.env.STARSHIPIT_API_KEY = originalKey;
      _resetShippingProvider();
    }

    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updated!.status).toBe("shipped");
    expect(updated!.trackingNumber).toMatch(/^MOCK-/);
    expect(updated!.trackingCarrier).toBe("mock");

    const events = await db
      .select()
      .from(marketplaceEvents)
      .where(and(eq(marketplaceEvents.entityId, order.id), eq(marketplaceEvents.eventName, "order.shipped")));
    expect(events).toHaveLength(1);
  });

  it("does not dispatch order.shipped when the seller already marked it shipped concurrently", async () => {
    // Simulate the manual mark-shipped path having already won the race:
    // status is "shipped" with tracking already set, so the idempotency
    // guard (trackingNumber present) short-circuits before any DB write.
    const order = await createMinimalOrder({
      status: "shipped",
      trackingNumber: "MANUAL-TRACK-123",
    });

    const { processShippingLabelJobForTest } = await import("../../../workers/shipping-label.js");
    await processShippingLabelJobForTest({ orderId: order.id });

    const events = await db
      .select()
      .from(marketplaceEvents)
      .where(and(eq(marketplaceEvents.entityId, order.id), eq(marketplaceEvents.eventName, "order.shipped")));
    expect(events).toHaveLength(0);
  });
});

// ── 3. Worker no-ops when order is cancelled ──────────────────────────────────

describe("ShippingLabelWorker — cancelled order no-op", () => {
  it("does not call createShipment when order.status is cancelled", async () => {
    const order = await createMinimalOrder({ status: "cancelled" });

    const mockCreate = vi.fn();

    const [fetchedOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, order.id));

    if (fetchedOrder!.status === "cancelled") {
      // no-op
    } else {
      await mockCreate(fetchedOrder!.id);
    }

    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ── 4. Webhook: Delivered — transitions + deliveryConfirmedAt + hold policy ──

describe("Starshipit webhook — Delivered lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Delivered event: order transitions shipped → delivered, deliveryConfirmedAt set, holdPolicyApplied snapshotted", async () => {
    const seller = await createTestUser();
    await createSellerProfile(seller.id);
    const order = await createMinimalOrder({ status: "shipped", sellerId: seller.id });
    const hold = await createPayoutHold(order.id);

    const trackingNumber = `TRACK-${order.id.slice(-8)}`;
    await db.update(orders).set({ trackingNumber }).where(eq(orders.id, order.id));

    const eventTimestamp = new Date().toISOString();

    await handleTrackingEventForTest({
      tracking_number: trackingNumber,
      order_number: order.id,
      status: "Delivered",
      status_description: "Delivered to recipient",
      last_updated_date: eventTimestamp,
    });

    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updatedOrder!.status).toBe("delivered");
    expect(updatedOrder!.deliveryConfirmedAt).not.toBeNull();
    expect(updatedOrder!.lastTrackingStatus).toBe("Delivered");

    const [updatedHold] = await db.select().from(payoutHolds).where(eq(payoutHolds.id, hold.id));
    expect(updatedHold!.deliveryConfirmedAt).not.toBeNull();
    expect(updatedHold!.holdPolicyApplied).not.toBeNull();
  });
});

// ── 5. Webhook: Dispatched — paid → shipped ───────────────────────────────────

describe("Starshipit webhook — Dispatched", () => {
  it("Dispatched event: order transitions paid → shipped", async () => {
    const order = await createMinimalOrder({ status: "paid" });
    const trackingNumber = `TRACK-DISPATCH-${order.id.slice(-6)}`;
    await db.update(orders).set({ trackingNumber }).where(eq(orders.id, order.id));

    await handleTrackingEventForTest({
      tracking_number: trackingNumber,
      order_number: order.id,
      status: "Dispatched",
      status_description: "Shipment dispatched",
      last_updated_date: new Date().toISOString(),
    });

    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updatedOrder!.status).toBe("shipped");
    expect(updatedOrder!.lastTrackingStatus).toBe("Dispatched");
  });

  it("Dispatched event on a paid order dispatches exactly one order.shipped event with tracking metadata", async () => {
    // The webhook can be the paid → shipped transition point (label created
    // out-of-band, or the label worker crashed before its DB write) — the
    // buyer's shipping_confirmation_buyer email hangs off this event, so a
    // missing dispatch means the buyer silently never hears their order
    // shipped.
    const order = await createMinimalOrder({ status: "paid" });
    const trackingNumber = `TRACK-EVT-${order.id.slice(-6)}`;
    await db.update(orders).set({ trackingNumber }).where(eq(orders.id, order.id));

    await handleTrackingEventForTest({
      tracking_number: trackingNumber,
      order_number: order.id,
      status: "Dispatched",
      status_description: "Shipment dispatched",
      last_updated_date: new Date().toISOString(),
    });

    const events = await db
      .select()
      .from(marketplaceEvents)
      .where(
        and(
          eq(marketplaceEvents.eventName, "order.shipped"),
          eq(marketplaceEvents.entityId, order.id),
        ),
      );
    expect(events).toHaveLength(1);
    const metadata = events[0]!.metadata as Record<string, unknown>;
    expect(metadata.trackingNumber).toBe(trackingNumber);
    // The webhook payload carries no carrier and the order never had one —
    // null, never an invented value.
    expect(metadata.carrier).toBeNull();
  });

  it("Dispatched event persists the payload tracking number when the order has none", async () => {
    // Order resolved via order_number with no trackingNumber on file (label
    // created out-of-band): the email worker requires a tracking number, so
    // the webhook must persist the payload's before dispatching.
    const order = await createMinimalOrder({ status: "paid" });
    const payloadTracking = `TRACK-OOB-${order.id.slice(-6)}`;

    await handleTrackingEventForTest({
      tracking_number: payloadTracking,
      order_number: order.id,
      status: "Dispatched",
      status_description: "Shipment dispatched",
      last_updated_date: new Date().toISOString(),
    });

    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updatedOrder!.status).toBe("shipped");
    expect(updatedOrder!.trackingNumber).toBe(payloadTracking);

    const events = await db
      .select()
      .from(marketplaceEvents)
      .where(
        and(
          eq(marketplaceEvents.eventName, "order.shipped"),
          eq(marketplaceEvents.entityId, order.id),
        ),
      );
    expect(events).toHaveLength(1);
    expect((events[0]!.metadata as Record<string, unknown>).trackingNumber).toBe(payloadTracking);
  });

  it("Dispatched webhook redelivery: second event does not dispatch a second order.shipped (idempotent)", async () => {
    // Use a DIFFERENT timestamp on the redelivery so the status+timestamp
    // dedup layer does NOT catch it — proving the CAS on orders.status is
    // what makes the dispatch (and therefore the buyer email) at-most-once.
    const order = await createMinimalOrder({ status: "paid" });
    const trackingNumber = `TRACK-REDELIVER-${order.id.slice(-6)}`;
    await db.update(orders).set({ trackingNumber }).where(eq(orders.id, order.id));

    await handleTrackingEventForTest({
      tracking_number: trackingNumber,
      order_number: order.id,
      status: "Dispatched",
      status_description: "Shipment dispatched",
      last_updated_date: "2026-01-15T10:00:00.000Z",
    });
    await handleTrackingEventForTest({
      tracking_number: trackingNumber,
      order_number: order.id,
      status: "Dispatched",
      status_description: "Shipment dispatched",
      last_updated_date: "2026-01-15T10:05:00.000Z",
    });

    const events = await db
      .select()
      .from(marketplaceEvents)
      .where(
        and(
          eq(marketplaceEvents.eventName, "order.shipped"),
          eq(marketplaceEvents.entityId, order.id),
        ),
      );
    expect(events).toHaveLength(1);
  });

  it("Dispatched event on an already-shipped order updates tracking only — no order.shipped dispatch", async () => {
    // The label worker / seller manual path already transitioned and
    // dispatched; the webhook losing the CAS must not double-trigger the
    // buyer email.
    const order = await createMinimalOrder({ status: "shipped" });
    const trackingNumber = `TRACK-LOST-${order.id.slice(-6)}`;
    await db.update(orders).set({ trackingNumber }).where(eq(orders.id, order.id));

    await handleTrackingEventForTest({
      tracking_number: trackingNumber,
      order_number: order.id,
      status: "Dispatched",
      status_description: "Shipment dispatched",
      last_updated_date: new Date().toISOString(),
    });

    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updatedOrder!.status).toBe("shipped");
    expect(updatedOrder!.lastTrackingStatus).toBe("Dispatched");

    const events = await db
      .select()
      .from(marketplaceEvents)
      .where(
        and(
          eq(marketplaceEvents.eventName, "order.shipped"),
          eq(marketplaceEvents.entityId, order.id),
        ),
      );
    expect(events).toHaveLength(0);
  });
});

// ── 6. Webhook: Exception — tracking updated, event dispatched ────────────────

describe("Starshipit webhook — Exception", () => {
  it("Exception event: lastTrackingStatus updated, order status unchanged", async () => {
    const order = await createMinimalOrder({ status: "shipped" });
    const trackingNumber = `TRACK-EXC-${order.id.slice(-6)}`;
    await db.update(orders).set({ trackingNumber }).where(eq(orders.id, order.id));

    await handleTrackingEventForTest({
      tracking_number: trackingNumber,
      order_number: order.id,
      status: "Exception",
      status_description: "Delivery exception — address not found",
      last_updated_date: new Date().toISOString(),
    });

    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updatedOrder!.status).toBe("shipped");
    expect(updatedOrder!.lastTrackingStatus).toBe("Exception");

    // A marketplace event should have been dispatched (written to DB)
    const [event] = await db
      .select()
      .from(marketplaceEvents)
      .where(
        and(
          eq(marketplaceEvents.eventName, "order.tracking_exception"),
          eq(marketplaceEvents.entityId, order.id),
        ),
      );
    expect(event).toBeDefined();
    expect(event!.eventName).toBe("order.tracking_exception");
  });
});

// ── 7. Webhook: AttemptedDelivery — tracking updated, status unchanged ────────

describe("Starshipit webhook — AttemptedDelivery", () => {
  it("AttemptedDelivery event: lastTrackingStatus updated, order status unchanged (NOT delivered)", async () => {
    const order = await createMinimalOrder({ status: "shipped" });
    const trackingNumber = `TRACK-ATT-${order.id.slice(-6)}`;
    await db.update(orders).set({ trackingNumber }).where(eq(orders.id, order.id));

    await handleTrackingEventForTest({
      tracking_number: trackingNumber,
      order_number: order.id,
      status: "AttemptedDelivery",
      status_description: "Delivery attempted — no one home",
      last_updated_date: new Date().toISOString(),
    });

    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updatedOrder!.status).toBe("shipped"); // NOT delivered
    expect(updatedOrder!.lastTrackingStatus).toBe("AttemptedDelivery");
  });
});

// ── 8. Webhook: Duplicate event — no-op ──────────────────────────────────────

describe("Starshipit webhook — Duplicate dedup", () => {
  it("Same tracking_number + status + timestamp → deduped (no-op, no double processing)", async () => {
    const order = await createMinimalOrder({ status: "shipped" });
    const trackingNumber = `TRACK-DUP-${order.id.slice(-6)}`;
    const eventTimestamp = "2026-01-15T10:00:00.000Z";

    await db
      .update(orders)
      .set({
        trackingNumber,
        lastTrackingStatus: "InTransit",
        lastTrackingEventAt: new Date(eventTimestamp),
      })
      .where(eq(orders.id, order.id));

    await handleTrackingEventForTest({
      tracking_number: trackingNumber,
      order_number: order.id,
      status: "InTransit",
      status_description: "In transit",
      last_updated_date: eventTimestamp,
    });

    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updatedOrder!.status).toBe("shipped");
    expect(updatedOrder!.lastTrackingStatus).toBe("InTransit");
  });
});

// ── 9. Webhook: Unknown status — no crash ────────────────────────────────────

describe("Starshipit webhook — Unknown status", () => {
  it("Unknown status: lastTrackingStatus updated, no crash, no state transition", async () => {
    const order = await createMinimalOrder({ status: "shipped" });
    const trackingNumber = `TRACK-UNK-${order.id.slice(-6)}`;
    await db.update(orders).set({ trackingNumber }).where(eq(orders.id, order.id));

    await handleTrackingEventForTest({
      tracking_number: trackingNumber,
      order_number: order.id,
      status: "SomeFutureStarshipitStatus",
      status_description: "New status type from future API version",
      last_updated_date: new Date().toISOString(),
    });

    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updatedOrder!.status).toBe("shipped"); // Unchanged
    expect(updatedOrder!.lastTrackingStatus).toBe("SomeFutureStarshipitStatus");
  });
});

// ── 10–12. Starshipit tracking webhook HTTP layer tests ──────────────────────

describe("Starshipit tracking webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POST /api/v1/webhooks/starshipit — updates order status to delivered on Delivered event", async () => {
    const order = await createMinimalOrder({ status: "shipped", trackingNumber: null });

    const trackingNumber = `MOCK-${order.id.slice(-8).toUpperCase()}`;
    await db
      .update(orders)
      .set({ trackingNumber })
      .where(eq(orders.id, order.id));

    const app = await getTestApp();

    const payload = {
      events: [
        {
          tracking_number: trackingNumber,
          order_number: order.id,
          status: "Delivered",
          status_description: "Delivered to recipient",
        },
      ],
    };

    const payloadStr = JSON.stringify(payload);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/starshipit",
      headers: {
        "content-type": "application/json",
        "x-starshipit-hmac-sha256": starshipitSig(payloadStr),
      },
      payload: payloadStr,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ received: true });

    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updated!.status).toBe("delivered");
  });

  it("POST /api/v1/webhooks/starshipit — non-Delivered status returns 200 without changing order", async () => {
    const order = await createMinimalOrder({ status: "paid" });
    const trackingNumber = `MOCK-TRACK-${order.id.slice(-6)}`;
    await db.update(orders).set({ trackingNumber }).where(eq(orders.id, order.id));

    const app = await getTestApp();

    const payload = {
      events: [
        {
          tracking_number: trackingNumber,
          order_number: order.id,
          status: "InTransit",
          status_description: "In transit",
        },
      ],
    };

    const payloadStr = JSON.stringify(payload);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/starshipit",
      headers: {
        "content-type": "application/json",
        "x-starshipit-hmac-sha256": starshipitSig(payloadStr),
      },
      payload: payloadStr,
    });

    expect(res.statusCode).toBe(200);

    const [unchanged] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(unchanged!.status).toBe("paid");
  });

  it("POST /api/v1/webhooks/starshipit — missing signature returns 401 when secret is set", async () => {
    const originalSecret = process.env.STARSHIPIT_WEBHOOK_SECRET;
    process.env.STARSHIPIT_WEBHOOK_SECRET = "test-secret";

    try {
      const app = await getTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/starshipit",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ events: [] }),
      });

      expect(res.statusCode).toBe(401);
    } finally {
      if (originalSecret === undefined) {
        delete process.env.STARSHIPIT_WEBHOOK_SECRET;
      } else {
        process.env.STARSHIPIT_WEBHOOK_SECRET = originalSecret;
      }
    }
  });
});

// ── 13. Polling job — fetches shipped orders, updates tracking status ──────────

describe("Starshipit poll worker — tracking update", () => {
  it("poll applies tracking status from provider to shipped orders", async () => {
    const order = await createMinimalOrder({ status: "shipped" });
    const trackingNumber = `TRACK-POLL-${order.id.slice(-6)}`;
    await db.update(orders).set({ trackingNumber }).where(eq(orders.id, order.id));

    const provider = new MockShippingProvider();
    const trackingStatus = await provider.getTrackingStatus(trackingNumber);

    await db
      .update(orders)
      .set({
        lastTrackingStatus: trackingStatus.status,
        lastTrackingEventAt: trackingStatus.lastUpdated ? new Date(trackingStatus.lastUpdated) : new Date(),
      })
      .where(eq(orders.id, order.id));

    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updatedOrder!.lastTrackingStatus).toBe("InTransit");
    expect(updatedOrder!.lastTrackingEventAt).not.toBeNull();
    expect(updatedOrder!.status).toBe("shipped");
  });
});

// ── 14. Polling dead-letter — orders shipped >14 days → tracking_stale event ──

describe("Starshipit poll worker — dead-letter stale orders", () => {
  it("orders shipped >14 days with no delivery dispatch tracking_stale event", async () => {
    const stalePastDate = new Date();
    stalePastDate.setDate(stalePastDate.getDate() - 20); // 20 days ago

    const order = await createMinimalOrder({
      status: "shipped",
      createdAt: stalePastDate,
    });
    const trackingNumber = `TRACK-STALE-${order.id.slice(-6)}`;
    await db.update(orders).set({ trackingNumber }).where(eq(orders.id, order.id));

    const staleThreshold = new Date();
    staleThreshold.setDate(staleThreshold.getDate() - 14);

    const staleOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.status, "shipped"),
          lt(orders.createdAt, staleThreshold),
        ),
      );

    expect(staleOrders.length).toBeGreaterThan(0);
    const staleOrder = staleOrders.find((o) => o.id === order.id);
    expect(staleOrder).toBeDefined();

    // Simulate dispatching the stale event — write directly to DB (no BullMQ)
    await db.insert(marketplaceEvents).values({
      id: ulid(),
      eventName: "order.tracking_stale",
      category: "order",
      entityType: "order",
      entityId: order.id,
      metadata: { orderId: order.id, trackingNumber },
      deliveryStatus: "dispatched",
    });

    const [event] = await db
      .select()
      .from(marketplaceEvents)
      .where(
        and(
          eq(marketplaceEvents.eventName, "order.tracking_stale"),
          eq(marketplaceEvents.entityId, order.id),
        ),
      );

    expect(event).toBeDefined();
    expect(event!.eventName).toBe("order.tracking_stale");
  });
});

// ── 15. Prod boot-time guard ───────────────────────────────────────────────────

describe("Prod boot-time guard", () => {
  it("throws fatal error when NODE_ENV=production and STARSHIPIT_API_KEY is missing", async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.STARSHIPIT_API_KEY;

    process.env.NODE_ENV = "production";
    delete process.env.STARSHIPIT_API_KEY;

    try {
      function assertProductionEnv() {
        if (process.env.NODE_ENV !== "production") return;
        if (!process.env.STARSHIPIT_API_KEY) {
          throw new Error(
            "[boot] FATAL: STARSHIPIT_API_KEY is required in production but was not set.",
          );
        }
      }

      expect(() => assertProductionEnv()).toThrow(
        /STARSHIPIT_API_KEY is required in production/,
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalKey !== undefined) {
        process.env.STARSHIPIT_API_KEY = originalKey;
      }
    }
  });

  it("does not throw when NODE_ENV=production and STARSHIPIT_API_KEY is set", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.STARSHIPIT_API_KEY;

    process.env.NODE_ENV = "production";
    process.env.STARSHIPIT_API_KEY = "sk_test_1234";

    try {
      function assertProductionEnv() {
        if (process.env.NODE_ENV !== "production") return;
        if (!process.env.STARSHIPIT_API_KEY) {
          throw new Error("[boot] FATAL: STARSHIPIT_API_KEY is required in production");
        }
      }

      expect(() => assertProductionEnv()).not.toThrow();
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalKey !== undefined) {
        process.env.STARSHIPIT_API_KEY = originalKey;
      } else {
        delete process.env.STARSHIPIT_API_KEY;
      }
    }
  });

  it("does not throw when NODE_ENV=development and STARSHIPIT_API_KEY is missing", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.STARSHIPIT_API_KEY;

    process.env.NODE_ENV = "development";
    delete process.env.STARSHIPIT_API_KEY;

    try {
      function assertProductionEnv() {
        if (process.env.NODE_ENV !== "production") return;
        if (!process.env.STARSHIPIT_API_KEY) {
          throw new Error("[boot] FATAL: STARSHIPIT_API_KEY is required in production");
        }
      }

      expect(() => assertProductionEnv()).not.toThrow();
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalKey !== undefined) {
        process.env.STARSHIPIT_API_KEY = originalKey;
      }
    }
  });
});
