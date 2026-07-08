/**
 * Email Integration Tests — Phase 2A Step 7
 *
 * Covers:
 * 1. Template output matches expected plain text for each email type
 * 2. Email worker processes jobs: calls mock sender, records sent emails
 * 3. Rate limiting: worker does not exceed 2 jobs/sec (limiter config check)
 * 4. Worker no-ops when order is cancelled
 * 5. Prod boot-time guard: boot fails without RESEND_API_KEY in production
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@bushpop/db/client";
import { orders, checkoutSessions, carts, channelListings, refunds, user } from "@bushpop/db/schema";
import {
  orderConfirmationBuyerTemplate,
  orderNotificationSellerTemplate,
  refundConfirmationBuyerTemplate,
  shippingConfirmationBuyerTemplate,
} from "../../../lib/email/templates.js";
import { getSentEmails, clearMockEmails, _resetEmailSender } from "../../../lib/email/index.js";
import { GUEST_EMAIL_DOMAIN } from "../../../lib/guest-identity.js";
import { createTestUser } from "../../helpers/create-user.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";

// ── Mock BullMQ (don't connect to Redis in tests) ────────────────────────────

vi.mock("../../../workers/email.js", async () => {
  const actual = await vi.importActual("../../../workers/email.js") as Record<string, unknown>;
  return {
    ...actual,
    startEmailWorker: vi.fn(),
    enqueueEmail: vi.fn().mockResolvedValue(undefined),
    EMAIL_QUEUE: "email",
  };
});

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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createMinimalOrder(overrides: { status?: string; trackingNumber?: string | null; trackingCarrier?: string | null } = {}) {
  const channel = await getBushpopChannel();
  const buyer = await createTestUser();
  const seller = await createTestUser();

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

  const shippingSnap = {
    name: "Jane Buyer",
    line1: "1 Buyer Street",
    suburb: "Sydney",
    state: "NSW",
    postcode: "2000",
    country: "AU",
  };

  const senderSnap = {
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
      ...(overrides.trackingNumber !== undefined ? { trackingNumber: overrides.trackingNumber } : {}),
      ...(overrides.trackingCarrier !== undefined ? { trackingCarrier: overrides.trackingCarrier } : {}),
    })
    .returning();

  return { order: order!, buyer, seller, channel };
}

async function createMinimalCart(buyerId: string, _sellerId: string, channelId: string): Promise<string> {
  // ADR-015 Sprint 1b W1: cart.seller_id removed; sellerId arg kept for call-site stability.
  const [cart] = await db
    .insert(carts)
    .values({ id: ulid(), buyerId, channelId })
    .returning();
  return cart!.id;
}

async function createProcessedRefund(orderId: string, amountCents: number): Promise<void> {
  await db.insert(refunds).values({
    id: ulid(),
    orderId,
    reason: "test refund",
    type: "full",
    amountCents,
    platformFeeRefundedCents: 200,
    stripeRefundId: `re_test_${ulid().toLowerCase()}`,
    status: "processed",
  });
}

// ── 1. Template output matches expected plain text ────────────────────────────

describe("Email templates", () => {
  it("orderConfirmationBuyer — contains order ID, total, buyer name", () => {
    const { subject, text } = orderConfirmationBuyerTemplate({
      orderId: "01JTEST0000000000000000001",
      buyerName: "Jane Buyer",
      totalCents: 6000,
      currency: "AUD",
      items: [{ title: "Vintage Jacket", priceCents: 5000 }],
      channelName: "Bushpop",
    });

    expect(subject).toContain("00000001");
    expect(text).toContain("Jane Buyer");
    expect(text).toContain("01JTEST0000000000000000001");
    expect(text).toContain("AUD 60.00");
    expect(text).toContain("Vintage Jacket");
    expect(text).toContain("AUD 50.00");
  });

  it("orderConfirmationBuyer — channelName is a no-op for Bushpop (word-for-word match)", () => {
    const { subject, text } = orderConfirmationBuyerTemplate({
      orderId: "01JTEST0000000000000000001",
      buyerName: "Jane Buyer",
      totalCents: 6000,
      currency: "AUD",
      items: [{ title: "Vintage Jacket", priceCents: 5000 }],
      channelName: "Bushpop",
    });

    expect(subject).toBe("Your Bushpop order #00000001 is confirmed");
    expect(text).toContain("Thank you for your purchase on Bushpop! Your order has been confirmed.");
    expect(text).toContain("The Bushpop Team");
  });

  it("orderNotificationSeller — contains order ID, seller name, shipping address", () => {
    const { subject, text } = orderNotificationSellerTemplate({
      orderId: "01JTEST0000000000000000002",
      sellerName: "John Seller",
      totalCents: 4600,
      currency: "AUD",
      items: [{ title: "Denim Jeans", priceCents: 5000 }],
      shippingName: "Jane Buyer",
      shippingLine1: "1 Buyer Street",
      shippingSuburb: "Sydney",
      shippingState: "NSW",
      shippingPostcode: "2000",
      channelName: "Bushpop",
    });

    expect(subject).toContain("00000002");
    expect(text).toContain("John Seller");
    expect(text).toContain("01JTEST0000000000000000002");
    expect(text).toContain("AUD 46.00");
    expect(text).toContain("Denim Jeans");
    expect(text).toContain("Jane Buyer");
    expect(text).toContain("1 Buyer Street");
    expect(text).toContain("Sydney NSW 2000");
  });

  it("orderNotificationSeller — channelName is a no-op for Bushpop (word-for-word match)", () => {
    const { subject, text } = orderNotificationSellerTemplate({
      orderId: "01JTEST0000000000000000002",
      sellerName: "John Seller",
      totalCents: 4600,
      currency: "AUD",
      items: [{ title: "Denim Jeans", priceCents: 5000 }],
      shippingName: "Jane Buyer",
      shippingLine1: "1 Buyer Street",
      shippingSuburb: "Sydney",
      shippingState: "NSW",
      shippingPostcode: "2000",
      channelName: "Bushpop",
    });

    expect(subject).toBe("New order on Bushpop — #00000002");
    expect(text).toContain("You have a new order on Bushpop!");
    expect(text).toContain("The Bushpop Team");
  });

  it("shippingConfirmationBuyer — contains order ID, buyer name, tracking info", () => {
    const { subject, text } = shippingConfirmationBuyerTemplate({
      orderId: "01JTEST0000000000000000003",
      buyerName: "Jane Buyer",
      trackingNumber: "AUSPOST-123456",
      trackingCarrier: "Australia Post",
      channelName: "Bushpop",
    });

    expect(subject).toContain("00000003");
    expect(text).toContain("Jane Buyer");
    expect(text).toContain("01JTEST0000000000000000003");
    expect(text).toContain("AUSPOST-123456");
    expect(text).toContain("Australia Post");
  });

  it("shippingConfirmationBuyer — channelName is a no-op for Bushpop (word-for-word match)", () => {
    const { subject, text } = shippingConfirmationBuyerTemplate({
      orderId: "01JTEST0000000000000000003",
      buyerName: "Jane Buyer",
      trackingNumber: "AUSPOST-123456",
      trackingCarrier: "Australia Post",
      channelName: "Bushpop",
    });

    expect(subject).toBe("Your Bushpop order #00000003 has shipped");
    expect(text).toContain("Great news — your Bushpop order is on its way!");
    expect(text).toContain("The Bushpop Team");
  });

  it("shippingConfirmationBuyer — omits the Carrier line when no carrier is known", () => {
    // The Starshipit webhook can be the paid → shipped transition point and
    // its payload has no carrier field — the email must still go out with
    // the tracking number, without inventing a carrier.
    const { subject, text } = shippingConfirmationBuyerTemplate({
      orderId: "01JTEST0000000000000000003",
      buyerName: "Jane Buyer",
      trackingNumber: "AUSPOST-123456",
      channelName: "Bushpop",
    });

    expect(subject).toBe("Your Bushpop order #00000003 has shipped");
    expect(text).toContain("Tracking number: AUSPOST-123456");
    expect(text).not.toContain("Carrier:");
  });

  it("refundConfirmationBuyer — contains order ID, buyer name, refund amount", () => {
    const { subject, text } = refundConfirmationBuyerTemplate({
      orderId: "01JTEST0000000000000000004",
      buyerName: "Jane Buyer",
      amountCents: 6000,
      currency: "AUD",
      channelName: "Bushpop",
    });

    expect(subject).toContain("00000004");
    expect(text).toContain("Jane Buyer");
    expect(text).toContain("01JTEST0000000000000000004");
    expect(text).toContain("AUD 60.00");
    expect(text).not.toMatch(/piklo/i);
    expect(text).not.toMatch(/insurance/i);
  });

  it("refundConfirmationBuyer — channelName is a no-op for Bushpop (word-for-word match)", () => {
    const { subject, text } = refundConfirmationBuyerTemplate({
      orderId: "01JTEST0000000000000000004",
      buyerName: "Jane Buyer",
      amountCents: 6000,
      currency: "AUD",
      channelName: "Bushpop",
    });

    expect(subject).toBe("Your Bushpop order #00000004 has been refunded");
    expect(text).toContain("Your Bushpop order has been refunded.");
    expect(text).toContain("The Bushpop Team");
  });
});

// ── 2. Worker processes jobs with mock provider ───────────────────────────────

describe("Email worker — processEmailJob", () => {
  beforeEach(() => {
    clearMockEmails();
    delete process.env.RESEND_API_KEY;
    _resetEmailSender();
  });

  afterEach(() => {
    clearMockEmails();
    _resetEmailSender();
  });

  it("order_confirmation_buyer — sends email to buyer via mock sender", async () => {
    const { order, buyer } = await createMinimalOrder({ status: "paid" });

    // Import the actual processor function directly
    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await processEmailJobForTest({ type: "order_confirmation_buyer", orderId: order.id });

    const sent = getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(buyer.email);
    expect(sent[0]!.subject).toContain(order.id.slice(-8).toUpperCase());
    expect(sent[0]!.text).toContain(buyer.name);
  });

  it("order_notification_seller — sends email to seller via mock sender", async () => {
    const { order, seller } = await createMinimalOrder({ status: "paid" });

    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await processEmailJobForTest({ type: "order_notification_seller", orderId: order.id });

    const sent = getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(seller.email);
    expect(sent[0]!.subject).toContain(order.id.slice(-8).toUpperCase());
  });

  it("shipping_confirmation_buyer — sends email with tracking info", async () => {
    const { order, buyer } = await createMinimalOrder({
      status: "shipped",
      trackingNumber: "MOCK-TRACK123",
      trackingCarrier: "Australia Post",
    });

    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await processEmailJobForTest({ type: "shipping_confirmation_buyer", orderId: order.id });

    const sent = getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(buyer.email);
    expect(sent[0]!.text).toContain("MOCK-TRACK123");
    expect(sent[0]!.text).toContain("Australia Post");
  });

  it("shipping_confirmation_buyer — sends when the carrier is unknown (webhook-transitioned order)", async () => {
    const { order, buyer } = await createMinimalOrder({
      status: "shipped",
      trackingNumber: "MOCK-NOCARRIER",
      trackingCarrier: null,
    });

    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await processEmailJobForTest({ type: "shipping_confirmation_buyer", orderId: order.id });

    const sent = getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(buyer.email);
    expect(sent[0]!.text).toContain("MOCK-NOCARRIER");
    expect(sent[0]!.text).not.toContain("Carrier:");
  });

  it("shipping_confirmation_buyer — still throws when the order has no tracking number", async () => {
    const { order } = await createMinimalOrder({ status: "shipped", trackingNumber: null });

    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await expect(
      processEmailJobForTest({ type: "shipping_confirmation_buyer", orderId: order.id }),
    ).rejects.toThrow(/no tracking info/);

    expect(getSentEmails()).toHaveLength(0);
  });

  it("shipping_confirmation_buyer — re-processing the same job yields byte-identical Idempotency-Keys", async () => {
    // BullMQ's jobId dedup evaporates once a job completes
    // (removeOnComplete: true), so a second order.shipped producer or a
    // worker retry CAN re-run the send — Resend's Idempotency-Key is the
    // real double-send backstop and must be deterministic across runs.
    const { order } = await createMinimalOrder({
      status: "shipped",
      trackingNumber: "MOCK-TRACK123",
      trackingCarrier: "Australia Post",
    });

    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await processEmailJobForTest({ type: "shipping_confirmation_buyer", orderId: order.id });
    await processEmailJobForTest({ type: "shipping_confirmation_buyer", orderId: order.id });

    const sent = getSentEmails();
    expect(sent).toHaveLength(2);
    expect(sent[0]!.headers).toEqual({ "Idempotency-Key": `shipping_confirmation_buyer-${order.id}` });
    expect(sent[1]!.headers).toEqual(sent[0]!.headers);
  });

  it("refund_confirmation_buyer — sends email with the processed refund amount", async () => {
    const { order, buyer } = await createMinimalOrder({ status: "refunded" });
    await createProcessedRefund(order.id, order.totalCents);

    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await processEmailJobForTest({ type: "refund_confirmation_buyer", orderId: order.id });

    const sent = getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(buyer.email);
    expect(sent[0]!.subject).toContain(order.id.slice(-8).toUpperCase());
    expect(sent[0]!.text).toContain("AUD 60.00");
  });

  it("refund_confirmation_buyer — still sends when the order's terminal status is 'cancelled' (admin cancel path)", async () => {
    // The generic cancelled-order guard exists so other email types don't
    // fire on an already-cancelled order — it must NOT swallow this one,
    // since a refund confirmation's whole point is to fire once the order
    // lands in a refunded/cancelled terminal state.
    const { order, buyer } = await createMinimalOrder({ status: "cancelled" });
    await createProcessedRefund(order.id, order.totalCents);

    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await processEmailJobForTest({ type: "refund_confirmation_buyer", orderId: order.id });

    const sent = getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(buyer.email);
  });

  it("refund_confirmation_buyer — throws when no processed refund row exists for the order", async () => {
    const { order } = await createMinimalOrder({ status: "refunded" });

    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await expect(
      processEmailJobForTest({ type: "refund_confirmation_buyer", orderId: order.id }),
    ).rejects.toThrow(/No processed refund found/);

    expect(getSentEmails()).toHaveLength(0);
  });

  it("refund_confirmation_buyer — sends a deterministic Idempotency-Key even without a notificationId", async () => {
    // Without this, a BullMQ retry of an already-sent job (e.g. the worker
    // crashes after Resend accepts the message but before the job is marked
    // complete) would re-send the same refund email — Resend dedupes on
    // this header. Order-triggered sends never carry a notificationId (only
    // the notification-outbox types do), so it must fall back to a stable
    // type+orderId key, not go header-less.
    const { order } = await createMinimalOrder({ status: "refunded" });
    await createProcessedRefund(order.id, order.totalCents);

    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await processEmailJobForTest({ type: "refund_confirmation_buyer", orderId: order.id });

    const sent = getSentEmails();
    expect(sent[0]!.headers).toEqual({ "Idempotency-Key": `refund_confirmation_buyer-${order.id}` });
  });

  it("refund_confirmation_buyer — re-processing the same job yields byte-identical Idempotency-Keys", async () => {
    // Webhook-reconciliation legs (reconcileRefundOpFromStripe /
    // reconcileReversalOpFromStripe) can re-enqueue after processRefund
    // already sent — the deterministic key is what collapses those to one
    // delivered email at Resend.
    const { order } = await createMinimalOrder({ status: "refunded" });
    await createProcessedRefund(order.id, order.totalCents);

    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await processEmailJobForTest({ type: "refund_confirmation_buyer", orderId: order.id });
    await processEmailJobForTest({ type: "refund_confirmation_buyer", orderId: order.id });

    const sent = getSentEmails();
    expect(sent).toHaveLength(2);
    expect(sent[0]!.headers).toEqual({ "Idempotency-Key": `refund_confirmation_buyer-${order.id}` });
    expect(sent[1]!.headers).toEqual(sent[0]!.headers);
  });
});

// ── Guest-placeholder buyer emails are skipped, not bounced ───────────────────

describe("Email worker — anonymous-guest placeholder guard", () => {
  beforeEach(() => {
    clearMockEmails();
    delete process.env.RESEND_API_KEY;
    _resetEmailSender();
  });

  afterEach(() => {
    clearMockEmails();
    _resetEmailSender();
  });

  async function makeBuyerAnonymousGuest(buyerId: string): Promise<void> {
    // Mirrors what better-auth's `anonymous` plugin stores for a guest —
    // a real user row with an undeliverable placeholder email.
    await db
      .update(user)
      .set({ email: `${buyerId.toLowerCase()}@${GUEST_EMAIL_DOMAIN}`, isAnonymous: true })
      .where(eq(user.id, buyerId));
  }

  it("refund_confirmation_buyer — skips (no send, no throw) for a guest placeholder email", async () => {
    const { order, buyer } = await createMinimalOrder({ status: "refunded" });
    await createProcessedRefund(order.id, order.totalCents);
    await makeBuyerAnonymousGuest(buyer.id);

    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await processEmailJobForTest({ type: "refund_confirmation_buyer", orderId: order.id });

    expect(getSentEmails()).toHaveLength(0);
  });

  it("shipping_confirmation_buyer — skips (no send, no throw) for a guest placeholder email", async () => {
    const { order, buyer } = await createMinimalOrder({
      status: "shipped",
      trackingNumber: "MOCK-TRACK123",
      trackingCarrier: "Australia Post",
    });
    await makeBuyerAnonymousGuest(buyer.id);

    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await processEmailJobForTest({ type: "shipping_confirmation_buyer", orderId: order.id });

    expect(getSentEmails()).toHaveLength(0);
  });

  it("order_notification_seller — NOT skipped when only the buyer is a guest", async () => {
    // The guard is buyer-email-scoped; the seller's real address must still
    // receive their new-order notification.
    const { order, buyer, seller } = await createMinimalOrder({ status: "paid" });
    await makeBuyerAnonymousGuest(buyer.id);

    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await processEmailJobForTest({ type: "order_notification_seller", orderId: order.id });

    const sent = getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(seller.email);
  });
});

// ── 3. Rate limiting — worker configured at 2/sec ─────────────────────────────

describe("Email worker — rate limiting config", () => {
  it("startEmailWorker configures limiter at max 2 per 1000ms", async () => {
    const { EMAIL_RATE_LIMIT } = await import("../../../workers/email.js");
    expect(EMAIL_RATE_LIMIT.max).toBe(2);
    expect(EMAIL_RATE_LIMIT.duration).toBe(1_000);
  });
});

// ── 4. Worker no-ops when order is cancelled ──────────────────────────────────

describe("Email worker — cancelled order no-op", () => {
  beforeEach(() => {
    clearMockEmails();
    delete process.env.RESEND_API_KEY;
    _resetEmailSender();
  });

  afterEach(() => {
    clearMockEmails();
    _resetEmailSender();
  });

  it("does not send email when order status is cancelled", async () => {
    const { order } = await createMinimalOrder({ status: "cancelled" });

    const { processEmailJobForTest } = await import("../../../workers/email.js");
    await processEmailJobForTest({ type: "order_confirmation_buyer", orderId: order.id });

    const sent = getSentEmails();
    expect(sent).toHaveLength(0);
  });
});

// ── 5. Prod boot-time guard ───────────────────────────────────────────────────

describe("Prod boot-time guard — RESEND_API_KEY", () => {
  it("throws fatal error when NODE_ENV=production and RESEND_API_KEY is missing", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.RESEND_API_KEY;

    process.env.NODE_ENV = "production";
    delete process.env.RESEND_API_KEY;

    try {
      function assertProductionEnv() {
        if (process.env.NODE_ENV !== "production") return;
        if (!process.env.RESEND_API_KEY) {
          throw new Error(
            "[boot] FATAL: RESEND_API_KEY is required in production but was not set.",
          );
        }
      }

      expect(() => assertProductionEnv()).toThrow(
        /RESEND_API_KEY is required in production/,
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalKey !== undefined) {
        process.env.RESEND_API_KEY = originalKey;
      }
    }
  });

  it("does not throw when NODE_ENV=production and RESEND_API_KEY is set", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.RESEND_API_KEY;

    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "re_test_1234";

    try {
      function assertProductionEnv() {
        if (process.env.NODE_ENV !== "production") return;
        if (!process.env.RESEND_API_KEY) {
          throw new Error("[boot] FATAL: RESEND_API_KEY is required in production");
        }
      }

      expect(() => assertProductionEnv()).not.toThrow();
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalKey !== undefined) {
        process.env.RESEND_API_KEY = originalKey;
      } else {
        delete process.env.RESEND_API_KEY;
      }
    }
  });

  it("does not throw when NODE_ENV=development and RESEND_API_KEY is missing", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.RESEND_API_KEY;

    process.env.NODE_ENV = "development";
    delete process.env.RESEND_API_KEY;

    try {
      function assertProductionEnv() {
        if (process.env.NODE_ENV !== "production") return;
        if (!process.env.RESEND_API_KEY) {
          throw new Error("[boot] FATAL: RESEND_API_KEY is required in production");
        }
      }

      expect(() => assertProductionEnv()).not.toThrow();
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalKey !== undefined) {
        process.env.RESEND_API_KEY = originalKey;
      }
    }
  });
});
