/**
 * Email sender factory.
 *
 * Returns the Resend sender in production/development (when RESEND_API_KEY is set),
 * otherwise falls back to the in-memory mock (used in test).
 *
 * No EmailProvider abstraction — Resend is called directly.
 * The mock swap is purely for test isolation.
 */

import type { SendEmailInput, SendEmailResult } from "./resend.js";
import { sendEmailViaResend } from "./resend.js";
import { sendEmailViaMock } from "./mock.js";

export type { SendEmailInput };
export { getSentEmails, clearMockEmails, setMockEmailError } from "./mock.js";
export * from "./templates.js";

export type EmailSender = (input: SendEmailInput) => Promise<SendEmailResult>;

let _sender: EmailSender | null = null;

export function getEmailSender(): EmailSender {
  if (_sender) return _sender;

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    _sender = sendEmailViaResend;
    console.info("[email] Using Resend email sender");
  } else {
    _sender = sendEmailViaMock;
    console.info("[email] RESEND_API_KEY not set — using mock email sender");
  }

  return _sender;
}

/**
 * Reset the sender singleton (for testing).
 * @internal
 */
export function _resetEmailSender(): void {
  _sender = null;
}
