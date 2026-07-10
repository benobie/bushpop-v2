import { describe, it, expect } from "vitest";
import { signUpTestUser, signInAnonymousTestUser } from "../../helpers/auth.js";
import { authedRequest } from "../../helpers/http.js";

// An anonymous (guest) session satisfies `requireAuth`. That is the intended
// design for cart/checkout/addresses/orders — all scoped by the session's own
// buyerId. It must NOT unlock account-shaped features: the frontend expects a
// 401 there, and the listing-report daily cap is per-reporter, so free
// identities would make it meaningless.

const ACCOUNT_ONLY_GET_ROUTES = [
  "/api/v1/customer/wishlist",
  "/api/v1/customer/saved-searches",
];

describe("requireRealAccount", () => {
  for (const route of ACCOUNT_ONLY_GET_ROUTES) {
    it(`GET ${route} returns 401 for an anonymous guest session`, async () => {
      const guest = await signInAnonymousTestUser();
      const res = await authedRequest(guest.sessionToken, "GET", route);
      expect(res.statusCode).toBe(401);
    });

    it(`GET ${route} returns 200 for a real account`, async () => {
      const realUser = await signUpTestUser();
      const res = await authedRequest(realUser.sessionToken, "GET", route);
      expect(res.statusCode).toBe(200);
    });
  }

  it("the guest session really is anonymous (guards the fixture, not just the route)", async () => {
    const guest = await signInAnonymousTestUser();
    expect(guest.user.isAnonymous).toBe(true);

    // /customer/me stays reachable by a guest ON PURPOSE — the frontend reads
    // `isAnonymous` from it to decide what to gate.
    const res = await authedRequest(guest.sessionToken, "GET", "/api/v1/customer/me");
    expect(res.statusCode).toBe(200);
    expect(res.json().user.isAnonymous).toBe(true);
  });

  it("POST /api/v1/customer/wishlist is refused for a guest", async () => {
    const guest = await signInAnonymousTestUser();
    const res = await authedRequest(guest.sessionToken, "POST", "/api/v1/customer/wishlist", {
      listingId: "01HZZZZZZZZZZZZZZZZZZZZZZZ",
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST a listing report is refused for a guest", async () => {
    const guest = await signInAnonymousTestUser();
    const res = await authedRequest(
      guest.sessionToken,
      "POST",
      "/api/v1/store/listings/01HZZZZZZZZZZZZZZZZZZZZZZZ/report",
      { reason: "counterfeit", details: "test" },
    );
    expect(res.statusCode).toBe(401);
  });

  it("still lets a guest reach the cart (guest commerce must keep working)", async () => {
    const guest = await signInAnonymousTestUser();
    const res = await authedRequest(guest.sessionToken, "GET", "/api/v1/store/cart");
    expect(res.statusCode).toBe(200);
  });
});
