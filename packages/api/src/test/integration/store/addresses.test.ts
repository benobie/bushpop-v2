import { describe, it, expect, beforeEach } from "vitest";
import { signUpTestUser } from "../../helpers/auth.js";
import { authedRequest } from "../../helpers/http.js";

const TEST_ADDRESS = {
  line1: "123 George Street",
  suburb: "Sydney",
  state: "NSW",
  postcode: "2000",
  country: "AU",
};

describe("Addresses API", () => {
  let sessionToken: string;
  let userId: string;

  beforeEach(async () => {
    const { user, sessionToken: token } = await signUpTestUser();
    userId = user.id;
    sessionToken = token;
  });

  describe("POST /api/v1/addresses", () => {
    it("creates an address", async () => {
      const res = await authedRequest(sessionToken, "POST", "/api/v1/addresses", TEST_ADDRESS);
      expect(res.statusCode).toBe(201);

      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.line1).toBe("123 George Street");
      expect(body.suburb).toBe("Sydney");
      expect(body.userId).toBe(userId);
    });

    it("returns 401 without auth", async () => {
      const { getTestApp } = await import("../../helpers/http.js");
      const app = await getTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/addresses",
        headers: { "content-type": "application/json", "x-channel": "bushpop" },
        payload: TEST_ADDRESS,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/v1/addresses", () => {
    it("lists own addresses", async () => {
      await authedRequest(sessionToken, "POST", "/api/v1/addresses", TEST_ADDRESS);
      await authedRequest(sessionToken, "POST", "/api/v1/addresses", {
        ...TEST_ADDRESS,
        line1: "456 Pitt Street",
      });

      const res = await authedRequest(sessionToken, "GET", "/api/v1/addresses");
      expect(res.statusCode).toBe(200);

      const body = res.json();
      expect(body).toBeInstanceOf(Array);
      expect(body.length).toBeGreaterThanOrEqual(2);
    });

    it("excludes soft-deleted addresses", async () => {
      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/addresses", TEST_ADDRESS);
      const addressId = createRes.json().id;

      await authedRequest(sessionToken, "DELETE", `/api/v1/addresses/${addressId}`);

      const listRes = await authedRequest(sessionToken, "GET", "/api/v1/addresses");
      const body = listRes.json() as Array<{ id: string }>;
      expect(body.find((a) => a.id === addressId)).toBeUndefined();
    });
  });

  describe("GET /api/v1/addresses/:id", () => {
    it("returns own address", async () => {
      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/addresses", TEST_ADDRESS);
      const addressId = createRes.json().id;

      const res = await authedRequest(sessionToken, "GET", `/api/v1/addresses/${addressId}`);
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(addressId);
    });

    it("returns 403 for another user's address", async () => {
      // Create address for user A
      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/addresses", TEST_ADDRESS);
      const addressId = createRes.json().id;

      // User B tries to access it
      const { sessionToken: otherToken } = await signUpTestUser({ email: `other-${Date.now()}@example.com` });
      const res = await authedRequest(otherToken, "GET", `/api/v1/addresses/${addressId}`);
      expect(res.statusCode).toBe(403);
    });
  });

  describe("PATCH /api/v1/addresses/:id", () => {
    it("updates an address", async () => {
      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/addresses", TEST_ADDRESS);
      const addressId = createRes.json().id;

      const res = await authedRequest(sessionToken, "PATCH", `/api/v1/addresses/${addressId}`, {
        line1: "789 Castlereagh Street",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().line1).toBe("789 Castlereagh Street");
    });
  });

  describe("DELETE /api/v1/addresses/:id", () => {
    it("soft-deletes an address (204)", async () => {
      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/addresses", TEST_ADDRESS);
      const addressId = createRes.json().id;

      const deleteRes = await authedRequest(sessionToken, "DELETE", `/api/v1/addresses/${addressId}`);
      expect(deleteRes.statusCode).toBe(204);
    });

    it("soft-deleted address excluded from GET /addresses", async () => {
      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/addresses", TEST_ADDRESS);
      const addressId = createRes.json().id;

      await authedRequest(sessionToken, "DELETE", `/api/v1/addresses/${addressId}`);

      const listRes = await authedRequest(sessionToken, "GET", "/api/v1/addresses");
      const ids = (listRes.json() as Array<{ id: string }>).map((a) => a.id);
      expect(ids).not.toContain(addressId);
    });

    it("returns 404 for soft-deleted address on GET", async () => {
      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/addresses", TEST_ADDRESS);
      const addressId = createRes.json().id;

      await authedRequest(sessionToken, "DELETE", `/api/v1/addresses/${addressId}`);

      const getRes = await authedRequest(sessionToken, "GET", `/api/v1/addresses/${addressId}`);
      expect(getRes.statusCode).toBe(404);
    });

    it("returns 403 for another user's address", async () => {
      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/addresses", TEST_ADDRESS);
      const addressId = createRes.json().id;

      const { sessionToken: otherToken } = await signUpTestUser({ email: `other2-${Date.now()}@example.com` });
      const res = await authedRequest(otherToken, "DELETE", `/api/v1/addresses/${addressId}`);
      expect(res.statusCode).toBe(403);
    });
  });
});
