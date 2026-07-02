// ---------------------------------------------------------------------------
// Admin alerts — operator escalation (money-safety WS6)
// ---------------------------------------------------------------------------
//
// Surfaces operator-attention events (resurrected auto-failed ops, payout
// releases that hit the manual-intervention path, etc.) via BOTH a structured
// console line (audit trail) AND a timeout-bounded direct email to ADMIN_EMAIL.
//
// CONTRACT: this function MUST NEVER throw. An alert is a side channel — a
// failed or slow send must never unwind the money-path transaction that
// triggered it. Every failure mode (no sender, send rejects, send hangs) is
// caught and logged here.

import { DEFAULT_CHANNEL, getChannelConfig } from "@bushpop/config";
import { getEmailSender } from "./email/index.js";

export interface AdminAlert {
  type: string;
  [key: string]: unknown;
}

const DEFAULT_ADMIN_EMAIL = "admin@piklo.com.au";
const ALERT_EMAIL_TIMEOUT_MS = 5_000;

/**
 * Enqueue an admin alert for operator attention.
 *
 * Logs a structured line, then attempts a timeout-bounded email to
 * ADMIN_EMAIL. Never throws — all errors are swallowed after logging.
 */
export async function enqueueAdminAlert(alert: AdminAlert): Promise<void> {
  // 1. Always log — the durable audit trail, independent of email delivery.
  console.warn(`[admin-alert] ${alert.type}: ${JSON.stringify(alert)}`);

  // 2. Best-effort, timeout-bounded email. Wrapped so a failure here is inert.
  try {
    const to = process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
    const sender = getEmailSender();

    const send = sender({
      to,
      subject: `[${getChannelConfig(process.env.CHANNEL_SLUG ?? DEFAULT_CHANNEL).name} admin alert] ${alert.type}`,
      text:
        `An operator-attention event was raised.\n\n` +
        `Type: ${alert.type}\n\n` +
        `Details:\n${JSON.stringify(alert, null, 2)}\n`,
    });

    const timeout = new Promise<never>((_, reject) => {
      const t = setTimeout(
        () => reject(new Error("admin alert email timed out")),
        ALERT_EMAIL_TIMEOUT_MS,
      );
      // Don't keep the event loop alive solely for this timer.
      if (typeof t === "object" && "unref" in t) t.unref();
    });

    await Promise.race([send, timeout]);
  } catch (err) {
    // Swallow — alert failures must never break the money path.
    console.error(
      `[admin-alert] failed to send alert email for '${alert.type}':`,
      err instanceof Error ? err.message : err,
    );
  }
}
