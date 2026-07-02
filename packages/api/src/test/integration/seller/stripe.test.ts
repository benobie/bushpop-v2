import { describe, it, expect, vi, beforeEach } from "vitest";
import { ulid } from "ulid";
import { db } from "@bushpop/db/client";
import { sellerProfiles } from "@bushpop/db/schema";
import { eq } from "drizzle-orm";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { authedRequest, getTestApp } from "../../helpers/http.js";
import { createStripeReadySeller } from "../../helpers/stripe-mock.js";

// ── Stripe mock ──────────────────────────────────────────────────────────────
// Mock the stripe singleton so no real API calls are made.
vi.mock("../../../lib/stripe.js", () => {
  const mockAccountId = "acct_mock_stripe_test";

  const mockStripe = {
    accounts: {
      create: vi.fn(async () => ({
        id: mockAccountId,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      })),
      retrieve: vi.fn(async () => ({
        id: mockAccountId,
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      })),
    },
    accountLinks: {
      create: vi.fn(async () => ({
        url: "https://connect.stripe.com/mock-onboarding-link",
      })),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };

  return {
    getStripe: vi.fn(() => mockStripe),
    _mockStripe: mockStripe,
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Stripe Connect — Seller Onboarding", () => {
  let sessionToken: string;
  let userId: string;

  beforeEach(async () => {
    const { user, sessionToken: token } = await signUpTestUser();
    userId = user.id;
    sessionToken = token;
    await grantSellerRole(userId);

    // Reset mocks between tests
    const { getStripe } = await import("../../../lib/stripe.js");
    const stripe = getStripe() as ReturnType<typeof getStripe>;
    vi.mocked(stripe.accounts.create).mockClear();
    vi.mocked(stripe.accounts.retrieve).mockClear();
    vi.mocked(stripe.accountLinks.create).mockClear();
    vi.mocked(stripe.webhooks.constructEvent).mockClear();
  });

  describe("POST /api/v1/seller/stripe/onboard", () => {
    it("creates a Stripe Connect account and returns an onboarding URL", async () => {
      const res = await authedRequest(sessionToken, "POST", "/api/v1/seller/stripe/onboard");

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.url).toBe("https://connect.stripe.com/mock-onboarding-link");

      // Stripe account ID should be persisted
      const [profile] = await db
        .select({ stripeAccountId: sellerProfiles.stripeAccountId })
        .from(sellerProfiles)
        .where(eq(sellerProfiles.userId, userId));

      expect(profile!.stripeAccountId).toBe("acct_mock_stripe_test");
    });

    it("returns 401 without auth", async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/seller/stripe/onboard",
        headers: { "x-channel": "bushpop" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 for non-seller", async () => {
      const { sessionToken: buyerToken } = await signUpTestUser({ email: "buyer@example.com" });
      const res = await authedRequest(buyerToken, "POST", "/api/v1/seller/stripe/onboard");
      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /api/v1/seller/stripe/status", () => {
    it("returns stripe status from DB", async () => {
      await createStripeReadySeller(userId, {
        stripeAccountId: "acct_ready",
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeOnboardingStatus: "complete",
      });

      const res = await authedRequest(sessionToken, "GET", "/api/v1/seller/stripe/status");

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.stripeAccountId).toBe("acct_ready");
      expect(body.stripeChargesEnabled).toBe(true);
      expect(body.stripePayoutsEnabled).toBe(true);
      expect(body.onboardingComplete).toBe(true);
    });

    it("returns null fields for seller with no Stripe account", async () => {
      const res = await authedRequest(sessionToken, "GET", "/api/v1/seller/stripe/status");

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.stripeAccountId).toBeNull();
      expect(body.stripeChargesEnabled).toBe(false);
      expect(body.onboardingComplete).toBe(false);
    });
  });

  describe("GET /api/v1/seller/stripe/refresh", () => {
    it("calls stripe.accounts.retrieve() and updates seller_profiles", async () => {
      // Set an account ID but start with charges disabled
      await createStripeReadySeller(userId, {
        stripeAccountId: "acct_mock_stripe_test",
        stripeChargesEnabled: false,
        stripePayoutsEnabled: false,
        stripeOnboardingStatus: "pending",
      });

      const res = await authedRequest(sessionToken, "GET", "/api/v1/seller/stripe/refresh");

      expect(res.statusCode).toBe(200);
      const body = res.json();

      // Mock returns charges_enabled: true — should be reflected
      expect(body.stripeChargesEnabled).toBe(true);
      expect(body.stripePayoutsEnabled).toBe(true);
      expect(body.onboardingComplete).toBe(true);

      // Verify DB was updated
      const [profile] = await db
        .select({
          stripeChargesEnabled: sellerProfiles.stripeChargesEnabled,
          stripePayoutsEnabled: sellerProfiles.stripePayoutsEnabled,
          stripeOnboardingStatus: sellerProfiles.stripeOnboardingStatus,
        })
        .from(sellerProfiles)
        .where(eq(sellerProfiles.userId, userId));

      expect(profile!.stripeChargesEnabled).toBe(true);
      expect(profile!.stripePayoutsEnabled).toBe(true);
      expect(profile!.stripeOnboardingStatus).toBe("complete");
    });

    it("returns 422 when no Stripe account is linked", async () => {
      const res = await authedRequest(sessionToken, "GET", "/api/v1/seller/stripe/refresh");
      expect(res.statusCode).toBe(422);
    });
  });
});

describe("Stripe Webhooks", () => {
  const WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests";

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  /**
   * Build a signed Stripe webhook request payload using crypto.
   */
  function buildStripePayload(event: object, secret: string) {
    const crypto = require("crypto");
    const payload = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac("sha256", secret.replace("whsec_", ""))
      .update(signedPayload)
      .digest("hex");
    const header = `t=${timestamp},v1=${signature}`;
    return { payload, header };
  }

  describe("POST /api/v1/webhooks/stripe", () => {
    it("returns 400 when stripe-signature header is missing", async () => {
      const app = await getTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/stripe",
        headers: { "content-type": "application/json", "x-channel": "bushpop" },
        payload: JSON.stringify({ id: "evt_1", type: "account.updated" }),
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects tampered payload (bad signature)", async () => {
      const { getStripe } = await import("../../../lib/stripe.js");
      const stripe = getStripe() as ReturnType<typeof getStripe>;

      // Make constructEvent throw to simulate signature failure
      vi.mocked(stripe.webhooks.constructEvent).mockImplementationOnce(() => {
        throw new Error("No signatures found matching the expected signature for payload");
      });

      const app = await getTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/stripe",
        headers: {
          "content-type": "application/json",
          "x-channel": "bushpop",
          "stripe-signature": "t=12345,v1=badsignature",
        },
        payload: JSON.stringify({ id: "evt_tampered", type: "account.updated" }),
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toContain("Webhook signature verification failed");
    });

    it("handles account.updated webhook and syncs seller_profiles", async () => {
      // Create a seller with a stripe account ID to sync
      const { user, sessionToken: token } = await signUpTestUser({
        email: "webhook-seller@example.com",
      });
      await grantSellerRole(user.id);
      await createStripeReadySeller(user.id, {
        stripeAccountId: "acct_webhook_test",
        stripeChargesEnabled: false,
        stripePayoutsEnabled: false,
        stripeOnboardingStatus: "pending",
      });

      const event = {
        id: "evt_account_updated_001",
        type: "account.updated",
        data: {
          object: {
            id: "acct_webhook_test",
            charges_enabled: true,
            payouts_enabled: true,
            details_submitted: true,
          },
        },
      };

      const { getStripe } = await import("../../../lib/stripe.js");
      const stripe = getStripe() as ReturnType<typeof getStripe>;

      // Make constructEvent return our event
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(event as unknown as import("stripe").Stripe.Event);

      const app = await getTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/stripe",
        headers: {
          "content-type": "application/json",
          "x-channel": "bushpop",
          "stripe-signature": "t=1,v1=mockedsig",
        },
        payload: JSON.stringify(event),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.received).toBe(true);

      // Verify seller_profiles was updated
      const [profile] = await db
        .select({
          stripeChargesEnabled: sellerProfiles.stripeChargesEnabled,
          stripePayoutsEnabled: sellerProfiles.stripePayoutsEnabled,
          stripeOnboardingStatus: sellerProfiles.stripeOnboardingStatus,
        })
        .from(sellerProfiles)
        .where(eq(sellerProfiles.userId, user.id));

      expect(profile!.stripeChargesEnabled).toBe(true);
      expect(profile!.stripePayoutsEnabled).toBe(true);
      expect(profile!.stripeOnboardingStatus).toBe("complete");
    });

    it("ignores duplicate webhooks (idempotent)", async () => {
      const eventId = `evt_dup_${ulid()}`;
      const event = {
        id: eventId,
        type: "account.updated",
        data: {
          object: {
            id: "acct_does_not_exist",
            charges_enabled: true,
            payouts_enabled: true,
            details_submitted: true,
          },
        },
      };

      const { getStripe } = await import("../../../lib/stripe.js");
      const stripe = getStripe() as ReturnType<typeof getStripe>;

      vi.mocked(stripe.webhooks.constructEvent)
        .mockReturnValue(event as unknown as import("stripe").Stripe.Event);

      const app = await getTestApp();

      // First call — should succeed
      const res1 = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/stripe",
        headers: {
          "content-type": "application/json",
          "x-channel": "bushpop",
          "stripe-signature": "t=1,v1=mockedsig",
        },
        payload: JSON.stringify(event),
      });
      expect(res1.statusCode).toBe(200);
      expect(res1.json().duplicate).toBeUndefined();

      // Second call — same event ID should be deduped
      const res2 = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/stripe",
        headers: {
          "content-type": "application/json",
          "x-channel": "bushpop",
          "stripe-signature": "t=1,v1=mockedsig",
        },
        payload: JSON.stringify(event),
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json().duplicate).toBe(true);
    });
  });
});
