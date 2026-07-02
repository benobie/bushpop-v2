import type { SendEmailInput } from "./resend.js";

/**
 * In-memory store for emails sent during tests.
 * Reset between tests with `clearMockEmails()`.
 */
const _sentEmails: SendEmailInput[] = [];
let _throwOnSend: string | null = null;

export async function sendEmailViaMock(input: SendEmailInput): Promise<{ providerMessageId?: string }> {
  if (_throwOnSend !== null) {
    throw new Error(_throwOnSend);
  }
  _sentEmails.push({ ...input });
  return {
    providerMessageId: `mock-email-${_sentEmails.length}`,
  };
}

export function getSentEmails(): ReadonlyArray<SendEmailInput> {
  return _sentEmails;
}

export function clearMockEmails(): void {
  _sentEmails.length = 0;
  _throwOnSend = null;
}

export function setMockEmailError(message: string): void {
  _throwOnSend = message;
}
