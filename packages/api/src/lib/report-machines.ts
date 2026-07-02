import type { StateMachine } from "./state-machine.js";

export type ReportStatus = "pending" | "reviewed" | "actioned" | "dismissed";

/**
 * Report Status Machine
 *
 * pending  → reviewed   (admin has reviewed it)
 * reviewed → actioned   (listing is hidden)
 * reviewed → dismissed  (report rejected)
 * actioned → reviewed   (reinstatement — listing restored)
 * dismissed → reviewed  (re-open for further review)
 */
export const REPORT_STATUS_MACHINE: StateMachine<ReportStatus> = {
  pending: ["reviewed"],
  reviewed: ["actioned", "dismissed"],
  actioned: ["reviewed"],   // reinstatement
  dismissed: ["reviewed"],  // re-open
};
