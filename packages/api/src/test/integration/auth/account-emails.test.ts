/**
 * Account email integration tests — B5 item 4.
 *
 * Verifies better-auth's password-reset and email-verification flows
 * actually send mail. Before this, auth.ts had no sendResetPassword /
 * sendVerificationEmail callbacks configured, so both endpoints either
 * 400'd ("Reset password isn't enabled") or silently no-op'd.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ulid } from "ulid";
import { signUpTestUser } from "../../helpers/auth.js";
import { getTestApp } from "../../helpers/http.js";
import { getSentEmails, clearMockEmails, _resetEmailSender } from "../../../lib/email/index.js";

describe("better-auth account emails", () => {
  beforeEach(() => {
    clearMockEmails();
    delete process.env.RESEND_API_KEY;
    _resetEmailSender();
  });

  afterEach(() => {
    clearMockEmails();
    _resetEmailSender();
  });

  it("request-password-reset sends a password reset email to the account holder", async () => {
    const email = `auth-reset-${ulid().toLowerCase()}@example.com`;
    await signUpTestUser({ email, name: "Reset Test User" });

    const app = await getTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/request-password-reset",
      headers: { "content-type": "application/json", "x-channel": "bushpop" },
      payload: { email },
    });

    expect(res.statusCode).toBe(200);

    const sent = getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(email);
    expect(sent[0]!.subject).toBe("Reset your Bushpop password");
    expect(sent[0]!.text).toMatch(/reset-password/);
    expect(sent[0]!.text).not.toMatch(/piklo/i);
  });

  it("send-verification-email sends a verification email to the account holder", async () => {
    const email = `auth-verify-${ulid().toLowerCase()}@example.com`;
    await signUpTestUser({ email, name: "Verify Test User" });

    const app = await getTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/send-verification-email",
      headers: { "content-type": "application/json", "x-channel": "bushpop" },
      payload: { email },
    });

    expect(res.statusCode).toBe(200);

    const sent = getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(email);
    expect(sent[0]!.subject).toBe("Confirm your email for Bushpop");
    expect(sent[0]!.text).toMatch(/verify-email/);
    expect(sent[0]!.text).not.toMatch(/piklo/i);
  });
});
