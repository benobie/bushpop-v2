import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { user as userTable, addresses } from "@bushpop/db/schema";
import { signUpTestUser, signInAnonymousTestUser, grantSellerRole } from "../../helpers/auth.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { authedRequest } from "../../helpers/http.js";

// ── Mock Stripe (same fixture as checkout.test.ts) ──────────────────────────
vi.mock("../../../lib/stripe.js", () => {
  const mockPaymentIntent = {
    id: "pi_test_mock123",
    client_secret: "pi_test_mock123_secret_abc",
    status: "requires_payment_method",
    amount: 0,
    currency: "aud",
    transfer_group: null,
    metadata: {},
  };
  const stripe = {
    paymentIntents: {
      create: vi.fn().mockResolvedValue(mockPaymentIntent),
      cancel: vi.fn().mockResolvedValue({ ...mockPaymentIntent, status: "canceled" }),
    },
    refunds: { create: vi.fn().mockResolvedValue({ id: "re_test_mock", amount: 0 }) },
  };
  return { getStripe: vi.fn(() => stripe), _resetStripe: vi.fn(), _mockStripe: stripe };
});

vi.mock("../../../workers/checkout-expiry.js", () => ({
  scheduleCheckoutExpiry: vi.fn().mockResolvedValue(undefined),
  startCheckoutExpiryWorker: vi.fn(),
  CHECKOUT_EXPIRY_QUEUE: "checkout-expiry",
}));

async function makeStripeReadySeller(userId: string) {
  await grantSellerRole(userId, { withDefaultAddress: true });
  const { db: dbClient } = await import("@bushpop/db/client");
  const { sellerProfiles } = await import("@bushpop/db/schema");
  await dbClient
    .update(sellerProfiles)
    .set({ stripeChargesEnabled: true, stripePayoutsEnabled: true })
    .where(eq(sellerProfiles.userId, userId));
}

async function createGuestAddress(buyerId: string): Promise<string> {
  const [addr] = await db
    .insert(addresses)
    .values({
      userId: buyerId,
      line1: "1 Guest Street",
      suburb: "Sydney",
      state: "NSW",
      postcode: "2000",
      country: "AU",
    })
    .returning();
  return addr!.id;
}

describe("Guest checkout (BF-08)", () => {
  let sellerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const seller = await signUpTestUser();
    sellerId = seller.user.id;
    await makeStripeReadySeller(sellerId);
  });

  it("initiates checkout as a guest and overwrites the placeholder email with buyerEmail", async () => {
    const listing = await createActiveTestListing(sellerId, { priceCents: 4500 });
    const guest = await signInAnonymousTestUser();

    await authedRequest(guest.sessionToken, "POST", "/api/v1/store/cart/items", { listingId: listing.id });
    const addressId = await createGuestAddress(guest.user.id);

    const res = await authedRequest(guest.sessionToken, "POST", "/api/v1/store/checkout", {
      shippingAddressId: addressId,
      buyerEmail: "real-guest@example.com",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().clientSecret).toBeTruthy();

    const [row] = await db.select().from(userTable).where(eq(userTable.id, guest.user.id));
    expect(row?.email).toBe("real-guest@example.com");
    expect(row?.isAnonymous).toBe(true);
  });

  it("rejects guest checkout with no buyerEmail", async () => {
    const listing = await createActiveTestListing(sellerId);
    const guest = await signInAnonymousTestUser();
    await authedRequest(guest.sessionToken, "POST", "/api/v1/store/cart/items", { listingId: listing.id });
    const addressId = await createGuestAddress(guest.user.id);

    const res = await authedRequest(guest.sessionToken, "POST", "/api/v1/store/checkout", {
      shippingAddressId: addressId,
    });

    expect(res.statusCode).toBe(422);
  });

  it("rejects a buyerEmail that already belongs to a real account, without changing the guest's email", async () => {
    const existing = await signUpTestUser({ email: "taken@example.com" });
    const listing = await createActiveTestListing(sellerId);
    const guest = await signInAnonymousTestUser();
    await authedRequest(guest.sessionToken, "POST", "/api/v1/store/cart/items", { listingId: listing.id });
    const addressId = await createGuestAddress(guest.user.id);

    const res = await authedRequest(guest.sessionToken, "POST", "/api/v1/store/checkout", {
      shippingAddressId: addressId,
      buyerEmail: existing.user.email,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("GUEST_EMAIL_ALREADY_REGISTERED");

    const [row] = await db.select().from(userTable).where(eq(userTable.id, guest.user.id));
    expect(row?.email).not.toBe(existing.user.email);
    expect(row?.isAnonymous).toBe(true);
  });

  it("ignores a buyerEmail sent by a real (non-anonymous) account — never overwrites a real email", async () => {
    const buyer = await signUpTestUser({ email: "buyer-real@example.com" });
    const listing = await createActiveTestListing(sellerId);
    await authedRequest(buyer.sessionToken, "POST", "/api/v1/store/cart/items", { listingId: listing.id });
    const addressId = await createGuestAddress(buyer.user.id);

    const res = await authedRequest(buyer.sessionToken, "POST", "/api/v1/store/checkout", {
      shippingAddressId: addressId,
      buyerEmail: "attacker-controlled@example.com",
    });

    expect(res.statusCode).toBe(200);

    const [row] = await db.select().from(userTable).where(eq(userTable.id, buyer.user.id));
    expect(row?.email).toBe("buyer-real@example.com");
  });
});
