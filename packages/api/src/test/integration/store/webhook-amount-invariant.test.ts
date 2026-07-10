import { describe, it, expect } from "vitest";
import { ulid } from "ulid";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { carts, checkoutSessions, orders, user } from "@bushpop/db/schema";
import { signUpTestUser } from "../../helpers/auth.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";
import { handlePaymentIntentSucceededForTest } from "../../../routes/v1/webhooks/stripe.js";

// The `payment_intent.succeeded` handler reads every money field from the
// checkout SESSION, never from the charge. These tests pin the invariant that
// the two must agree before anything is fulfilled.

async function setupSession(): Promise<{ sessionId: string; paymentIntentId: string }> {
  const channel = await getBushpopChannel();
  const buyer = await signUpTestUser();

  const sellerId = ulid();
  await db.insert(user).values({
    id: sellerId,
    name: "Test Seller",
    email: `seller-${sellerId.toLowerCase()}@example.com`,
    emailVerified: true,
  });

  const cartId = ulid();
  const sessionId = ulid();
  const paymentIntentId = `pi_invariant_${sessionId.toLowerCase()}`;

  await db.insert(carts).values({ id: cartId, buyerId: buyer.user.id, channelId: channel.id });

  await db.insert(checkoutSessions).values({
    id: sessionId,
    cartId,
    buyerId: buyer.user.id,
    channelId: channel.id,
    status: "payment_pending",
    subtotalCents: 5000,
    shippingCents: 1000,
    platformFeeCents: 500,
    sellerProceedsCents: 5500,
    totalCents: 6000,
    currency: "AUD",
    stripePaymentIntentId: paymentIntentId,
  });

  return { sessionId, paymentIntentId };
}

describe("payment_intent.succeeded — charge/session money invariant", () => {
  it("refuses to fulfil when the captured amount is less than the quoted total", async () => {
    const { sessionId, paymentIntentId } = await setupSession();

    await expect(
      handlePaymentIntentSucceededForTest(paymentIntentId, { amount: 100 }),
    ).rejects.toThrow(/does not match checkout session/);

    // Fail closed: no order, and the session is NOT marked succeeded, so a
    // corrected redelivery can still be processed.
    const [order] = await db.select().from(orders).where(eq(orders.checkoutSessionId, sessionId));
    expect(order).toBeUndefined();

    const [session] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, sessionId));
    expect(session!.status).toBe("payment_pending");
  });

  it("refuses to fulfil when the captured amount exceeds the quoted total", async () => {
    const { sessionId, paymentIntentId } = await setupSession();

    await expect(
      handlePaymentIntentSucceededForTest(paymentIntentId, { amount: 999_999 }),
    ).rejects.toThrow(/does not match checkout session/);

    const [order] = await db.select().from(orders).where(eq(orders.checkoutSessionId, sessionId));
    expect(order).toBeUndefined();
  });

  it("refuses to fulfil when the currency differs from the quoted currency", async () => {
    const { sessionId, paymentIntentId } = await setupSession();

    await expect(
      handlePaymentIntentSucceededForTest(paymentIntentId, { amount: 6000, currency: "usd" }),
    ).rejects.toThrow(/does not match checkout session/);

    const [order] = await db.select().from(orders).where(eq(orders.checkoutSessionId, sessionId));
    expect(order).toBeUndefined();
  });

  it("passes the invariant on a matching amount, regardless of currency casing", async () => {
    const { paymentIntentId } = await setupSession();

    // Stripe sends lowercase currency; the session stores uppercase. This must
    // NOT be treated as a mismatch. The handler proceeds past the invariant and
    // then fails further downstream on this bare fixture (which has no cart
    // items) — that later, different error is the proof it got through.
    await expect(
      handlePaymentIntentSucceededForTest(paymentIntentId, { amount: 6000, currency: "aud" }),
    ).rejects.toThrow(/No cart items found/);
  });
});
