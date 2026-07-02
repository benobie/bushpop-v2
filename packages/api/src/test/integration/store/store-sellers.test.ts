import { describe, it, expect, beforeEach } from "vitest";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { publicRequest } from "../../helpers/http.js";

describe("Store Sellers API", () => {
  let userId: string;
  let sellerHandle: string;
  let sellerId: string;

  beforeEach(async () => {
    const { user } = await signUpTestUser();
    userId = user.id;
    const profile = await grantSellerRole(userId);
    sellerHandle = profile.handle;
    sellerId = profile.id;
  });

  describe("GET /api/v1/store/sellers/:id", () => {
    it("returns public seller profile by ID", async () => {
      const res = await publicRequest("GET", `/api/v1/store/sellers/${sellerId}`);
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.id).toBe(sellerId);
      expect(body.handle).toBeDefined();
      expect(body.storeName).toBeDefined();
    });

    it("returns public seller profile by handle", async () => {
      const res = await publicRequest("GET", `/api/v1/store/sellers/${sellerHandle}`);
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body.handle).toBe(sellerHandle);
    });

    it("returns only public fields (no Stripe or internal data)", async () => {
      const res = await publicRequest("GET", `/api/v1/store/sellers/${sellerId}`);
      const body = res.json();

      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("handle");
      expect(body).toHaveProperty("storeName");
      expect(body).toHaveProperty("bio");
      expect(body).toHaveProperty("avatarUrl");
      expect(body).toHaveProperty("verifiedAt");
      expect(body).toHaveProperty("createdAt");

      // Must NOT expose internal fields
      expect(body).not.toHaveProperty("userId");
      expect(body).not.toHaveProperty("stripeAccountId");
      expect(body).not.toHaveProperty("stripeChargesEnabled");
      expect(body).not.toHaveProperty("stripePayoutsEnabled");
      expect(body).not.toHaveProperty("vacationMode");
    });

    it("returns 404 for unknown seller", async () => {
      const res = await publicRequest("GET", "/api/v1/store/sellers/01AAAAAAAAAAAAAAAAAAAAAAA1");
      expect(res.statusCode).toBe(404);
    });
  });
});
