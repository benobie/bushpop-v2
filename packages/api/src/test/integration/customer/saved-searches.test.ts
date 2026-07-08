import { beforeEach, describe, expect, it } from "vitest";
import { signUpTestUser } from "../../helpers/auth.js";
import { authedRequest } from "../../helpers/http.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";

describe("Customer Saved Searches API", () => {
  let channelId: string;
  let sessionToken: string;

  beforeEach(async () => {
    const [{ sessionToken: token }, channel] = await Promise.all([
      signUpTestUser(),
      getBushpopChannel(),
    ]);

    sessionToken = token;
    channelId = channel.id;
  });

  describe("POST /api/v1/customer/saved-searches", () => {
    it("creates a saved search with a name", async () => {
      const res = await authedRequest(sessionToken, "POST", "/api/v1/customer/saved-searches", {
        channelId,
        query: "Vintage Jackets",
        filters: { category: "jackets", sizes: ["M", "L"] },
        name: "Winter jackets",
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        name: "Winter jackets",
        query: "Vintage Jackets",
        channelId,
        filters: { category: "jackets", sizes: ["M", "L"] },
      });
    });

    it("defaults channelId to the request channel when omitted", async () => {
      const res = await authedRequest(sessionToken, "POST", "/api/v1/customer/saved-searches", {
        query: "no channel id supplied",
        filters: { category: "jackets" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ channelId });
    });

    it("creates a saved search without a name", async () => {
      const res = await authedRequest(sessionToken, "POST", "/api/v1/customer/saved-searches", {
        channelId,
        query: "linen shirt",
        filters: { category: "shirts" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        name: null,
        query: "linen shirt",
        channelId,
        filters: { category: "shirts" },
      });
    });

    it("returns 409 for duplicate saved searches", async () => {
      const body = {
        channelId,
        query: "linen shirt",
        filters: { category: "shirts", color: "blue" },
      };

      const first = await authedRequest(
        sessionToken,
        "POST",
        "/api/v1/customer/saved-searches",
        body,
      );
      const second = await authedRequest(
        sessionToken,
        "POST",
        "/api/v1/customer/saved-searches",
        body,
      );

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(409);
    });

    it("deduplicates filters with different object key ordering", async () => {
      const first = await authedRequest(sessionToken, "POST", "/api/v1/customer/saved-searches", {
        channelId,
        query: "denim",
        filters: {
          category: "jackets",
          price: { min: 20, max: 80 },
        },
      });

      const second = await authedRequest(sessionToken, "POST", "/api/v1/customer/saved-searches", {
        channelId,
        query: "DENIM",
        filters: {
          price: { max: 80, min: 20 },
          category: "jackets",
        },
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(409);
    });

    it("deduplicates arrays of primitives regardless of order", async () => {
      const first = await authedRequest(sessionToken, "POST", "/api/v1/customer/saved-searches", {
        channelId,
        query: "overshirt",
        filters: {
          sizes: ["M", "L"],
          colors: ["blue", "green"],
        },
      });

      const second = await authedRequest(sessionToken, "POST", "/api/v1/customer/saved-searches", {
        channelId,
        query: "overshirt",
        filters: {
          sizes: ["L", "M"],
          colors: ["green", "blue"],
        },
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(409);
    });

    it("enforces a maximum of 20 saved searches per user", async () => {
      for (let index = 0; index < 20; index += 1) {
        const res = await authedRequest(sessionToken, "POST", "/api/v1/customer/saved-searches", {
          channelId,
          query: `query-${index}`,
          filters: { category: "shirts", index },
        });

        expect(res.statusCode).toBe(201);
      }

      const overflow = await authedRequest(
        sessionToken,
        "POST",
        "/api/v1/customer/saved-searches",
        {
          channelId,
          query: "query-21",
          filters: { category: "shirts", index: 21 },
        },
      );

      expect(overflow.statusCode).toBe(422);
      expect(overflow.json()).toMatchObject({
        error: "VALIDATION_ERROR",
        message: "Maximum saved searches reached",
      });
    });
  });

  describe("GET /api/v1/customer/saved-searches", () => {
    it("lists saved searches ordered by most recent first", async () => {
      const first = await authedRequest(sessionToken, "POST", "/api/v1/customer/saved-searches", {
        channelId,
        query: "boots",
        filters: { category: "shoes" },
        name: "Boots",
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await authedRequest(sessionToken, "POST", "/api/v1/customer/saved-searches", {
        channelId,
        query: "coats",
        filters: { category: "outerwear" },
        name: "Coats",
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);

      const res = await authedRequest(
        sessionToken,
        "GET",
        `/api/v1/customer/saved-searches?channelId=${channelId}`,
      );

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        items: [
          { query: "coats", name: "Coats", channelId },
          { query: "boots", name: "Boots", channelId },
        ],
      });
    });

    it("defaults to the request channel when channelId query param is omitted", async () => {
      await authedRequest(sessionToken, "POST", "/api/v1/customer/saved-searches", {
        channelId,
        query: "no channel query",
        filters: { category: "shoes" },
      });

      const res = await authedRequest(sessionToken, "GET", "/api/v1/customer/saved-searches");

      expect(res.statusCode).toBe(200);
      expect(res.json().items).toMatchObject([{ query: "no channel query", channelId }]);
    });
  });

  describe("PATCH /api/v1/customer/saved-searches/:id", () => {
    it("adds a label to a saved search created without one", async () => {
      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/customer/saved-searches", {
        channelId,
        query: "trench coats",
        filters: { category: "outerwear" },
      });
      const savedSearch = createRes.json() as { id: string };

      const patchRes = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/customer/saved-searches/${savedSearch.id}`,
        { name: "Trench coats" },
      );

      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.json()).toMatchObject({ id: savedSearch.id, name: "Trench coats" });
    });

    it("clears a label when name is null", async () => {
      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/customer/saved-searches", {
        channelId,
        query: "denim jackets",
        filters: { category: "jackets" },
        name: "Denim",
      });
      const savedSearch = createRes.json() as { id: string };

      const patchRes = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/customer/saved-searches/${savedSearch.id}`,
        { name: null },
      );

      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.json()).toMatchObject({ id: savedSearch.id, name: null });
    });

    it("returns 404 when renaming another user's saved search", async () => {
      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/customer/saved-searches", {
        channelId,
        query: "silk scarves",
        filters: { category: "accessories" },
      });
      const savedSearch = createRes.json() as { id: string };

      const { sessionToken: otherToken } = await signUpTestUser();
      const patchRes = await authedRequest(
        otherToken,
        "PATCH",
        `/api/v1/customer/saved-searches/${savedSearch.id}`,
        { name: "Not mine" },
      );

      expect(patchRes.statusCode).toBe(404);
    });

    it("returns 404 for a non-existent saved search", async () => {
      const patchRes = await authedRequest(
        sessionToken,
        "PATCH",
        "/api/v1/customer/saved-searches/01JFAKE0000000000000000000",
        { name: "Ghost" },
      );

      expect(patchRes.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/v1/customer/saved-searches/:id", () => {
    it("deletes the caller's own saved search", async () => {
      const createRes = await authedRequest(
        sessionToken,
        "POST",
        "/api/v1/customer/saved-searches",
        {
          channelId,
          query: "cardigans",
          filters: { category: "knitwear" },
        },
      );

      expect(createRes.statusCode).toBe(201);
      const savedSearch = createRes.json() as { id: string };

      const deleteRes = await authedRequest(
        sessionToken,
        "DELETE",
        `/api/v1/customer/saved-searches/${savedSearch.id}`,
      );
      const listRes = await authedRequest(
        sessionToken,
        "GET",
        `/api/v1/customer/saved-searches?channelId=${channelId}`,
      );

      expect(deleteRes.statusCode).toBe(204);
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json()).toEqual({ items: [] });
    });

    it("returns 404 when deleting another user's saved search", async () => {
      const [{ sessionToken: otherToken }] = await Promise.all([signUpTestUser()]);

      const createRes = await authedRequest(otherToken, "POST", "/api/v1/customer/saved-searches", {
        channelId,
        query: "blazers",
        filters: { category: "tailoring" },
      });

      expect(createRes.statusCode).toBe(201);
      const savedSearch = createRes.json() as { id: string };

      const deleteRes = await authedRequest(
        sessionToken,
        "DELETE",
        `/api/v1/customer/saved-searches/${savedSearch.id}`,
      );

      expect(deleteRes.statusCode).toBe(404);
    });
  });
});
