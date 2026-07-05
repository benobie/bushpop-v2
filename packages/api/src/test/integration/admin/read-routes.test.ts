import { describe, it, expect } from "vitest";
import { ulid } from "ulid";
import { db } from "@bushpop/db/client";
import { userRoles } from "@bushpop/db/schema";
import { signUpTestUser } from "../../helpers/auth.js";
import { authedRequest } from "../../helpers/http.js";

// B3 v1: read-first admin surfaces. These are thin smoke tests — 200 for an
// admin caller, 403 for a non-admin caller — the interesting state-machine
// logic lives in the write path (orders-refund.test.ts) and refund-service.

async function adminSession() {
  const admin = await signUpTestUser();
  await db.insert(userRoles).values({ userId: admin.user.id, role: "admin" });
  return admin.sessionToken;
}

describe("admin read routes", () => {
  const routes = [
    "/api/v1/admin/orders",
    "/api/v1/admin/listings",
    "/api/v1/admin/payouts",
    "/api/v1/admin/ai-usage",
    "/api/v1/admin/ai-usage/summary",
    "/api/v1/admin/fees",
    "/api/v1/admin/email-jobs/failed",
  ];

  for (const route of routes) {
    it(`GET ${route} returns 200 for an admin caller`, async () => {
      const session = await adminSession();
      const res = await authedRequest(session, "GET", route);
      expect(res.statusCode).toBe(200);
    });

    it(`GET ${route} returns 403 for a non-admin caller`, async () => {
      const buyer = await signUpTestUser();
      const res = await authedRequest(buyer.sessionToken, "GET", route);
      expect(res.statusCode).toBe(403);
    });
  }

  it("GET /api/v1/admin/orders/:id returns 404 for a missing order", async () => {
    const session = await adminSession();
    const res = await authedRequest(session, "GET", `/api/v1/admin/orders/${ulid()}`);
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/v1/admin/listings/:id returns 404 for a missing listing", async () => {
    const session = await adminSession();
    const res = await authedRequest(session, "GET", `/api/v1/admin/listings/${ulid()}`);
    expect(res.statusCode).toBe(404);
  });
});
