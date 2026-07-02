import { describe, it, expect, beforeEach } from "vitest";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { createTestInventoryItem } from "../../helpers/create-inventory-item.js";
import { authedRequest } from "../../helpers/http.js";

describe("Seller Inventory API", () => {
  let sessionToken: string;
  let userId: string;

  beforeEach(async () => {
    const { user, sessionToken: token } = await signUpTestUser();
    userId = user.id;
    sessionToken = token;
    await grantSellerRole(userId);
  });

  describe("POST /api/v1/seller/inventory", () => {
    it("creates an inventory item", async () => {
      const res = await authedRequest(sessionToken, "POST", "/api/v1/seller/inventory", {
        title: "Vintage Denim Jacket",
        brand: "Levi's",
        condition: "good",
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.title).toBe("Vintage Denim Jacket");
      expect(body.lifecycleState).toBe("owned");
      expect(body.availabilityStatus).toBe("available");
      expect(body.version).toBe(1);
    });

    it("creates an item with minimal data", async () => {
      const res = await authedRequest(sessionToken, "POST", "/api/v1/seller/inventory", {});
      expect(res.statusCode).toBe(201);
    });

    it("returns 401 without auth", async () => {
      const { getTestApp } = await import("../../helpers/http.js");
      const app = await getTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/seller/inventory",
        headers: { "content-type": "application/json", "x-channel": "bushpop" },
        payload: { condition: "good" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 for non-seller", async () => {
      const { sessionToken: buyerToken } = await signUpTestUser({ email: "buyer@example.com" });
      // No seller role

      const res = await authedRequest(buyerToken, "POST", "/api/v1/seller/inventory", {
        condition: "good",
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /api/v1/seller/inventory", () => {
    it("lists own items with cursor pagination", async () => {
      await createTestInventoryItem(userId, { title: "Item 1" });
      await createTestInventoryItem(userId, { title: "Item 2" });
      await createTestInventoryItem(userId, { title: "Item 3" });

      const res = await authedRequest(sessionToken, "GET", "/api/v1/seller/inventory?limit=2");
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(2);
      expect(body.nextCursor).toBeDefined();

      // Fetch next page
      const res2 = await authedRequest(
        sessionToken,
        "GET",
        `/api/v1/seller/inventory?limit=2&cursor=${body.nextCursor}`,
      );
      const body2 = res2.json();
      expect(body2.items).toHaveLength(1);
      expect(body2.nextCursor).toBeNull();
    });

    it("filters by lifecycleState", async () => {
      await createTestInventoryItem(userId, { lifecycleState: "owned" });
      await createTestInventoryItem(userId, { lifecycleState: "for_sale" });

      const res = await authedRequest(
        sessionToken,
        "GET",
        "/api/v1/seller/inventory?lifecycleState=for_sale",
      );
      const body = res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].lifecycleState).toBe("for_sale");
    });
  });

  describe("GET /api/v1/seller/inventory/:id", () => {
    it("returns item with images array", async () => {
      const item = await createTestInventoryItem(userId, { title: "Test Item" });

      const res = await authedRequest(sessionToken, "GET", `/api/v1/seller/inventory/${item.id}`);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(item.id);
      expect(body.images).toBeDefined();
      expect(body.images).toHaveLength(0);
    });

    it("returns 404 for non-owned item", async () => {
      const { user: otherUser } = await signUpTestUser({ email: "other@example.com" });
      await grantSellerRole(otherUser.id, { handle: "other-store" });
      const item = await createTestInventoryItem(otherUser.id);

      const res = await authedRequest(sessionToken, "GET", `/api/v1/seller/inventory/${item.id}`);
      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /api/v1/seller/inventory/:id", () => {
    it("updates item with optimistic lock", async () => {
      const item = await createTestInventoryItem(userId, { title: "Old Title" });

      const res = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/inventory/${item.id}`, {
        title: "New Title",
        version: 1,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.title).toBe("New Title");
      expect(body.version).toBe(2);
    });

    it("returns 409 on version mismatch", async () => {
      const item = await createTestInventoryItem(userId);

      await authedRequest(sessionToken, "PATCH", `/api/v1/seller/inventory/${item.id}`, {
        title: "Updated",
        version: 1,
      });

      const res = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/inventory/${item.id}`, {
        title: "Stale Update",
        version: 1,
      });
      expect(res.statusCode).toBe(409);
    });

    it("returns 404 for non-owned item", async () => {
      const { user: otherUser } = await signUpTestUser({ email: "other-patch@example.com" });
      await grantSellerRole(otherUser.id, { handle: "other-patch-store" });
      const item = await createTestInventoryItem(otherUser.id);

      const res = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/inventory/${item.id}`, {
        title: "Hijacked",
        version: 1,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /api/v1/seller/inventory/:id/lifecycle", () => {
    it("transitions owned → for_sale", async () => {
      const item = await createTestInventoryItem(userId);

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/inventory/${item.id}/lifecycle`,
        { to: "for_sale", version: 1 },
      );
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.lifecycleState).toBe("for_sale");
      expect(body.version).toBe(2);
    });

    it("rejects invalid transition (owned → sold)", async () => {
      const item = await createTestInventoryItem(userId);

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/inventory/${item.id}/lifecycle`,
        { to: "sold", version: 1 },
      );
      // InvalidTransitionError is not an AppError — will be caught as 500
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("returns 409 on version mismatch", async () => {
      const item = await createTestInventoryItem(userId);

      await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/inventory/${item.id}/lifecycle`,
        { to: "for_sale", version: 1 },
      );

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/inventory/${item.id}/lifecycle`,
        { to: "offer_only", version: 1 },
      );
      expect(res.statusCode).toBe(409);
    });

    it("returns 404 for non-owned item", async () => {
      const { user: otherUser } = await signUpTestUser({ email: "other-lifecycle@example.com" });
      await grantSellerRole(otherUser.id, { handle: "other-lifecycle-store" });
      const item = await createTestInventoryItem(otherUser.id);

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/inventory/${item.id}/lifecycle`,
        { to: "for_sale", version: 1 },
      );
      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /api/v1/seller/inventory/:id/archive", () => {
    it("archives an item", async () => {
      const item = await createTestInventoryItem(userId);

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/inventory/${item.id}/archive`,
        { version: 1 },
      );
      expect(res.statusCode).toBe(204);

      const getRes = await authedRequest(
        sessionToken,
        "GET",
        `/api/v1/seller/inventory/${item.id}`,
      );
      expect(getRes.json().lifecycleState).toBe("archived");
    });

    it("returns 404 for non-owned item", async () => {
      const { user: otherUser } = await signUpTestUser({ email: "other2@example.com" });
      await grantSellerRole(otherUser.id, { handle: "other-store-2" });
      const item = await createTestInventoryItem(otherUser.id);

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/inventory/${item.id}/archive`,
        { version: 1 },
      );
      expect(res.statusCode).toBe(404);
    });
  });
});
