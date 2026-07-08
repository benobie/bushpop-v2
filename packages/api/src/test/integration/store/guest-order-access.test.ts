import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@bushpop/db/client";
import { carts, checkoutSessions, orders } from "@bushpop/db/schema";
import { signUpTestUser, signInAnonymousTestUser, grantSellerRole } from "../../helpers/auth.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";
import { publicRequest } from "../../helpers/http.js";
import { deriveGuestOrderToken } from "../../../lib/guest-order-access.js";

/** Insert a paid order directly, bypassing checkout — same pattern as pickup-code.test.ts. */
async function insertPaidOrder(opts: { buyerId: string; sellerId: string; channelId: string }) {
  const [cart] = await db
    .insert(carts)
    .values({ buyerId: opts.buyerId, channelId: opts.channelId })
    .onConflictDoUpdate({ target: [carts.buyerId, carts.channelId], set: { updatedAt: new Date() } })
    .returning();

  const [checkoutSession] = await db
    .insert(checkoutSessions)
    .values({
      cartId: cart!.id,
      buyerId: opts.buyerId,
      channelId: opts.channelId,
      status: "succeeded",
      subtotalCents: 4500,
      shippingCents: 0,
      platformFeeCents: 400,
      sellerProceedsCents: 4100,
      totalCents: 4500,
      currency: "AUD",
    })
    .returning();

  const [order] = await db
    .insert(orders)
    .values({
      checkoutSessionId: checkoutSession!.id,
      buyerId: opts.buyerId,
      sellerId: opts.sellerId,
      channelId: opts.channelId,
      status: "paid",
      subtotalCents: 4500,
      shippingCents: 0,
      platformFeeCents: 400,
      sellerProceedsCents: 4100,
      totalCents: 4500,
      currency: "AUD",
      stripePaymentIntentId: "pi_test_mock_guest_order",
    })
    .returning();

  return order!;
}

describe("Guest order-access token (BF-08)", () => {
  let sellerId: string;
  let channelId: string;

  beforeEach(async () => {
    const seller = await signUpTestUser();
    sellerId = seller.user.id;
    await grantSellerRole(sellerId);
    const channel = await getBushpopChannel();
    channelId = channel.id;
  });

  it("returns the order for a valid token, scoped to the buyer who owns it", async () => {
    const guest = await signInAnonymousTestUser();
    const order = await insertPaidOrder({ buyerId: guest.user.id, sellerId, channelId });
    const token = deriveGuestOrderToken(order.id, guest.user.id);

    const res = await publicRequest("GET", `/api/v1/store/orders/${order.id}/guest?token=${token}`);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(order.id);
    expect(body.buyerId).toBe(guest.user.id);
    expect(body).not.toHaveProperty("shippingLabelUrl");
  });

  it("404s on a wrong token — same response as a nonexistent order (no enumeration)", async () => {
    const guest = await signInAnonymousTestUser();
    const order = await insertPaidOrder({ buyerId: guest.user.id, sellerId, channelId });

    const wrongTokenRes = await publicRequest(
      "GET",
      `/api/v1/store/orders/${order.id}/guest?token=not-the-real-token`,
    );
    const missingOrderRes = await publicRequest(
      "GET",
      `/api/v1/store/orders/01JFAKE0000000000000000000/guest?token=not-the-real-token`,
    );

    expect(wrongTokenRes.statusCode).toBe(404);
    expect(missingOrderRes.statusCode).toBe(404);
  });

  it("404s a token that's valid for a DIFFERENT order — cross-order scoping", async () => {
    const guestA = await signInAnonymousTestUser();
    const guestB = await signInAnonymousTestUser();
    const orderA = await insertPaidOrder({ buyerId: guestA.user.id, sellerId, channelId });
    const orderB = await insertPaidOrder({ buyerId: guestB.user.id, sellerId, channelId });

    // Token correctly derived for orderA/guestA — must not unlock orderB.
    const tokenForOrderA = deriveGuestOrderToken(orderA.id, guestA.user.id);
    const res = await publicRequest(
      "GET",
      `/api/v1/store/orders/${orderB.id}/guest?token=${tokenForOrderA}`,
    );

    expect(res.statusCode).toBe(404);
  });

  it("400s when the token query param is missing", async () => {
    const guest = await signInAnonymousTestUser();
    const order = await insertPaidOrder({ buyerId: guest.user.id, sellerId, channelId });

    const res = await publicRequest("GET", `/api/v1/store/orders/${order.id}/guest`);

    expect(res.statusCode).toBe(400);
  });
});
