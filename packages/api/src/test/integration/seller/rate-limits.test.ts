import { describe, it, expect, beforeEach, vi } from "vitest";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { authedRequest } from "../../helpers/http.js";

vi.mock("../../../lib/r2.js", async () => {
  const { mockR2 } = await import("../../helpers/r2-mock.js");
  return mockR2();
});

/**
 * Task 10 — sell-flow rate limits, keyed by USER via hook:'preHandler'.
 * These tests would fail if the limiter ran at onRequest: request.user
 * would be unset, the key would degrade to IP, and every test user (all on
 * 127.0.0.1) would share one bucket.
 */

describe("Sell-flow rate limits", () => {
  let sessionToken: string;
  let userId: string;
  let draftId: string;

  beforeEach(async () => {
    const { user, sessionToken: token } = await signUpTestUser();
    userId = user.id;
    sessionToken = token;
    await grantSellerRole(userId);
    const res = await authedRequest(sessionToken, "POST", "/api/v1/seller/drafts", {});
    draftId = res.json().id;
  });

  it("presign is limited to 20/min", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 21; i++) {
      const res = await authedRequest(
        sessionToken,
        "POST",
        `/api/v1/seller/drafts/${draftId}/images/upload-url`,
        { contentType: "image/jpeg" },
      );
      lastStatus = res.statusCode;
      // First 10 presign (200); 11–20 trip the max-10-images guard (409) —
      // either way each request consumes the 20/min bucket.
      if (i < 10) expect(res.statusCode).toBe(200);
      else if (i < 20) expect(res.statusCode).toBe(409);
    }
    expect(lastStatus).toBe(429);
  });

  it("keys by user id, not IP — a second seller on the same IP is unaffected", async () => {
    // Exhaust the first seller's presign bucket
    for (let i = 0; i < 21; i++) {
      await authedRequest(
        sessionToken,
        "POST",
        `/api/v1/seller/drafts/${draftId}/images/upload-url`,
        { contentType: "image/jpeg" },
      );
    }

    const { user: other, sessionToken: otherToken } = await signUpTestUser();
    await grantSellerRole(other.id);
    const otherDraft = (
      await authedRequest(otherToken, "POST", "/api/v1/seller/drafts", {})
    ).json();

    const res = await authedRequest(
      otherToken,
      "POST",
      `/api/v1/seller/drafts/${otherDraft.id}/images/upload-url`,
      { contentType: "image/jpeg" },
    );
    // Same loopback IP as the exhausted seller — but a fresh user bucket.
    expect(res.statusCode).toBe(200);
  });

  it("publish is limited to 10/min (429 on the 11th attempt)", async () => {
    let got429 = false;
    for (let i = 0; i < 11; i++) {
      const res = await authedRequest(
        sessionToken,
        "POST",
        `/api/v1/seller/drafts/${draftId}/publish`,
        { version: 1, legalAgree: false },
      );
      if (i < 10) {
        expect(res.statusCode).toBe(422); // gate failures still consume the bucket
      } else {
        got429 = res.statusCode === 429;
      }
    }
    expect(got429).toBe(true);
  });

  it("ai-draft requests are limited to 6/min", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 7; i++) {
      const res = await authedRequest(
        sessionToken,
        "POST",
        `/api/v1/seller/drafts/${draftId}/ai-draft`,
        { trigger: "auto" },
      );
      lastStatus = res.statusCode;
      // 503 (no AI key in the test env) — still consumes the ai-draft bucket
      if (i < 6) expect(res.statusCode).toBe(503);
    }
    expect(lastStatus).toBe(429);
  });

  it("the auth proxy allowList escape still works in the test env", async () => {
    // /api/auth/* is limited to 10/min per IP with a NODE_ENV=test
    // allowList — the suite's many signups (well past 10 by now, same IP)
    // only work because of it. One more proves the escape hatch.
    const { user } = await signUpTestUser();
    expect(user.id).toBeTruthy();
  });
});
