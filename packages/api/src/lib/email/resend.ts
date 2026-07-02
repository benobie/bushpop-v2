import { Resend } from "resend";
import { DEFAULT_CHANNEL, getChannelConfig } from "@bushpop/config";

let _client: Resend | null = null;

function getResendClient(): Resend {
  if (!_client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("[email] RESEND_API_KEY is not set — cannot send emails via Resend");
    }
    _client = new Resend(apiKey);
    console.info("[email] Resend client initialised");
  }
  return _client;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  providerMessageId?: string;
}

export async function sendEmailViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getResendClient();
  const displayName = getChannelConfig(process.env.CHANNEL_SLUG ?? DEFAULT_CHANNEL).name;
  const address = process.env.RESEND_FROM_EMAIL ?? "noreply@piklo.com.au";
  const { data, error } = await client.emails.send({
    from: `${displayName} <${address}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    headers: input.headers,
  });

  if (error) {
    throw new Error(`[email] Resend send failed: ${error.message}`);
  }

  return {
    providerMessageId: data?.id ?? undefined,
  };
}

/**
 * Reset the Resend client singleton (for testing).
 * @internal
 */
export function _resetResendClient(): void {
  _client = null;
}
