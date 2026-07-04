# Bushpop transactional email matrix

**Owner:** whoever touches `packages/api/src/lib/email/` or `packages/api/src/workers/email.ts` — update this doc in the same PR.
**Status:** LIVING DOCUMENT — this is the G5 support-readiness gate's build-time record (`~/projects/Bushpop/docs/cutover/launch2-runbook.md` §4.1 is the private mirror with production smoke receipts; this doc is the public-safe repo copy — no Stripe history, no dispute counts here, ever).
**Why this exists:** v1 (WordPress) died on silent transactional email plus the support failure that followed — see the business zero-context handoff §8. Every row below must have a real trigger, a real template, and a real test before it counts as done.

---

## 1. The matrix

| # | Email | Recipient | Template | Trigger | Customer-facing at launch | How tested |
|---|---|---|---|---|---|---|
| 1 | Buyer order confirmation | Buyer | `orderConfirmationBuyerTemplate` (`lib/email/templates.ts`) | Stripe webhook `payment_intent.succeeded` → order created (`routes/v1/webhooks/stripe.ts:725`) | YES | `test/integration/email/email.test.ts` — template content + worker send via mock sender |
| 2 | Seller order notification | Seller | `orderNotificationSellerTemplate` | Same webhook, immediately after row 1 (`stripe.ts:726`) | Internal at launch (Bushpop is the only seller) — still verified | `test/integration/email/email.test.ts` |
| 3 | Buyer shipping confirmation (with tracking) | Buyer | `shippingConfirmationBuyerTemplate` | `order.shipped` domain event (two producers — see §2 below) → `event-consumer.ts` → `enqueueEmail` | YES | `test/integration/email/email.test.ts` (template + send) + `test/integration/shipping/shipping.test.ts` (event dispatch, both producers) |
| 4 | **Refund confirmation** | Buyer | `refundConfirmationBuyerTemplate` | `processRefund()` success — all 6 terminal completion points (see §2) | YES | `lib/refund-service.test.ts` (10 new assertions across every completion point incl. out-of-order webhook reconciliation) + `test/integration/email/email.test.ts` (template + worker send, incl. the admin-cancel "cancelled" status case) |
| 5 | Listing published | Seller | `listingPublishedSellerTemplate` | Listing publish (`drafts/publish-service.ts`) → notification outbox | Internal at launch | Pre-existing (Phase 1 sell-flow tests) |
| 6 | Tracking-exception admin alert | Admin (`ADMIN_EMAIL`) | `trackingExceptionAdminTemplate` | `order.tracking_exception` event / reversal failure alert (`refund-service.ts`) | Internal | `test/integration/email/email.test.ts`, `test/integration/shipping/shipping.test.ts` |
| 7 | Account emails — verify email / reset password | Account holder | `accountVerificationEmailTemplate` / `passwordResetEmailTemplate` | better-auth `send-verification-email` / `request-password-reset` endpoints | YES | `test/integration/auth/account-emails.test.ts` — see §3, this was **not wired at all** before this session |
| 8 | Score nudge / report actioned / report reinstated | Seller | `scoreNudgeTemplate` / `reportActionedTemplate` / `reportReinstatedTemplate` | Notification outbox (Phase 3a) | Not launch-critical — defer, don't block | Pre-existing |

Plus, every row rides the same infrastructure:

- **Sender:** Resend, `noreply@bushpop.com.au`, dynamic display name resolved from channel config (currently always "Bushpop" — single-tenant).
- **Delivery:** BullMQ `email` queue, concurrency 1, rate-limited to 2/sec, 3 attempts with exponential backoff (5s base).
- **Idempotency:** notification-outbox rows (`notifications` table) dedup by `(order_id, notification_type)` where a `notificationId` is used; direct order-triggered sends (rows 1–3, 6) key the BullMQ job on `type-orderId` so a re-enqueue of the same email is deduped at the queue level.

## 2. Findings + fixes this session (B5, 05/07/2026)

### Row 3 — shipping confirmation enqueue gap (CLOSED)

The launch roadmap flagged this as missing; re-verified against current code before touching anything, per the stop-rule.

**What was actually true:** there are **two** producers of `order.shipped`:
1. **Manual** — the seller's `PATCH /seller/orders/:id/ship` (`routes/v1/seller/orders/service.ts`) already dispatched `order.shipped` correctly. This path was fine.
2. **Automated** — the Starshipit/mock label worker (`workers/shipping-label.ts`) generated a label and persisted `trackingNumber`/`trackingCarrier` directly on the order, but **never transitioned `orders.status` to `shipped` and never dispatched any event** — so on the automated path (the one that runs once `STARSHIPIT_SUBSCRIPTION_KEY` is set and labels actually generate), the buyer would never receive a shipping confirmation, and the order would stay stuck in `paid` forever.

**Fix:** `workers/shipping-label.ts` now does the same CAS status transition (`paid` → `shipped`) and `dispatchEvent({ eventName: "order.shipped", ... })` that the manual path does, so both producers drive the *same* consumer (`event-consumer.ts`) and there is exactly one enqueue site to maintain. A lost race (seller already marked shipped manually) is a no-op, matching the existing idempotency guard.

### Row 7 — account emails were not wired at all (CLOSED)

This was flagged as "unverified" — the actual state was stronger than that: `packages/api/src/lib/auth.ts` had **no `sendVerificationEmail` or `sendResetPassword` callback configured at all**. Concretely, before this session:
- `POST /api/auth/request-password-reset` would 400 with `RESET_PASSWORD_DISABLED` (better-auth refuses the flow outright without a callback).
- `POST /api/auth/send-verification-email` would silently no-op (no callback to invoke).

There is also no forgot-password UI page in `apps/market` yet — but better-auth mounts these API routes regardless of whether a frontend page calls them, so the backend plumbing needed to exist independently of that UI work.

**Fix:** added `accountVerificationEmailTemplate` / `passwordResetEmailTemplate` (voice-guide "near-zero cheek" trust-surface register — plain, warm, no jokes, standard "if you didn't request this" safety line) and wired both callbacks in `auth.ts` via the same `getEmailSender()` used everywhere else. Verified end-to-end against the real better-auth HTTP routes with the mock sender (`test/integration/auth/account-emails.test.ts`).

### Dead-letter visibility (CLOSED)

No code queried the email queue's failed-job list — a permanently-failed send had no visible surface anywhere (BullMQ's `removeOnFail: 3` just meant "keep the last 3 failed jobs in Redis", not "someone can see them"). Added `getFailedEmailJobs()` (`workers/email.ts`) wrapping `queue.getFailed()`, and a real-BullMQ integration test (`test/integration/email/email-dlq.test.ts`, not the mocked-queue style used elsewhere in the suite) that forces a permanent send failure and asserts it's queryable — proving the "visible, not silent" requirement rather than just asserting the error isn't swallowed in-process.

This is a query surface, not a shipped admin UI — B3 (admin panel, next batch) is where `getFailedEmailJobs()` should surface into an actual page for Ben/support to look at.

### Row 4 — refund confirmation built (money-adjacent, PR held for Ben)

`processRefund()` (`lib/refund-service.ts`) has **six** distinct points where an order lands in a `refunded`/`cancelled` terminal state — the primary pre-transfer and post-transfer success paths, two crash-recovery paths in `resumePendingRefunds()`, and two out-of-order webhook-reconciliation paths (`reconcileRefundOpFromStripe` / `reconcileReversalOpFromStripe`, which can each be the *first* or *second* leg to arrive). Every one of them now enqueues `refund_confirmation_buyer` — a silent refund on any of these six paths is exactly the v1 wound this session exists to close.

Two correctness details worth flagging for reviewers:
1. **Admin cancellations refund via the same `processRefund()` call** with `terminalOrderStatus: "cancelled"` instead of `"refunded"` — the buyer still got their money back, so the email must fire on `"cancelled"` too. The email worker's existing guard (`if (order.status === "cancelled") return;`, meant to stop other email types firing on an already-dead order) is explicitly exempted for this one type.
2. **The two reconciliation paths can defer** — if the reversal webhook arrives before the refund webhook (or vice versa), the first one to land leaves the order in `refund_in_progress` and must NOT send the email; only the leg that actually finalises the order does. Both `reconcile*` functions were changed to return a boolean (finalised vs deferred) so the enqueue call is conditional on that, not on the transaction merely completing without throwing.

**Cross-model (Codex) review completed.** Findings and disposition:
- **Fixed:** order-triggered sends (all 4 direct types — order confirmation, shipping confirmation, refund confirmation, tracking-exception alert) previously carried no `Idempotency-Key` header to Resend unless routed through the notification-outbox path. A BullMQ retry of an already-sent job (worker crashes after Resend accepts the send but before the job is marked complete) could re-send the same email. Added `resendIdempotencyKey()`, falling back to the same `type-orderId` string already used as the BullMQ jobId when no `notificationId` is present — closes the gap for all four types, not just refunds.
- **Fixed (test-coverage gap):** `resumePendingRefunds()`'s reversal-op crash-recovery branch had **zero** test coverage before this PR (only the refund-op branch was tested) — added a dedicated test. Also added a test proving a rejected `enqueueEmail()` never crashes `processRefund()` (the money-critical side of the refund must never depend on the email side channel succeeding).
- **Disclosed, not fixed here:** every enqueue happens *after* its DB transaction commits — a crash in the gap between commit and enqueue would leave that specific refund without an email and no automatic re-trigger (the payment op is already `succeeded`/terminal, so a later webhook redelivery short-circuits rather than re-enqueueing). This is real, but it is **not unique to this PR** — it's the exact same pattern the three pre-existing order-lifecycle emails already use (`webhooks/stripe.ts` enqueues `order_confirmation_buyer`/`order_notification_seller` the same way, immediately after the order INSERT commits, with no durable outbox record). Properly closing this needs a transactional-outbox pattern (write an email-pending marker in the *same* DB transaction as the status change, dispatch from a separate sweeper) across **all** order-triggered emails, not a refund-specific fix — flagged here as a future hardening item for whoever owns the next reliability pass on this queue, not a blocker for this PR.

Held for Ben's merge per the git-workflow money-path rule — never auto-merged.

### De-hardcode check (VERIFIED CLEAN)

`grep -rniI "piklo"` across `lib/email/`, `workers/email.ts`, `workers/shipping-label.ts`, `lib/auth.ts` — zero matches. Confirms the business zero-context handoff's §7 claim that customer-facing email surfaces are clean.

### Deliverability — SPF / DKIM / DMARC (VERIFIED, 05/07/2026)

Checked directly via `dig` against the live DNS (not the Resend dashboard, which none of these sessions have access to):

| Record | Host | Value | Status |
|---|---|---|---|
| SPF | `send.bushpop.com.au` | `v=spf1 include:amazonses.com ~all` | ✅ present (Resend's SES-backed sending infra) |
| MX (bounce) | `send.bushpop.com.au` | `10 feedback-smtp.ap-northeast-1.amazonses.com` | ✅ present |
| DKIM | `resend._domainkey.bushpop.com.au` | RSA public key TXT record | ✅ present |
| DMARC | `_dmarc.bushpop.com.au` | `v=DMARC1; p=none; sp=none; adkim=r; aspf=r; pct=100; ...` | ✅ present, **policy = `none` (monitor-only)** |

The three records Resend's custom-domain setup requires (SPF+MX on the `send.` subdomain, DKIM on the root) are all in place — this matches the "domain verified 03/07" note in the dev zero-context handoff. DMARC exists but isn't enforcing (`p=none`): mail won't be rejected/quarantined on alignment failure, which is the standard safe starting posture, not a launch blocker. **Hardening opportunity, not a gate item:** move to `p=quarantine` once outbound volume is proven stable post-launch.

### Starshipit label email leg (BLOCKED — unchanged, Ben action)

`STARSHIPIT_SUBSCRIPTION_KEY` is empty on staging → every real Starshipit `createShipment` call 403s (confirmed again this session — see the shipping test's need to force the mock provider). This blocks testing the *real* carrier label path end-to-end; the mock-provider path (and therefore the shipping-confirmation email trigger fixed above) is fully covered by tests. Once Ben sets the key in Coolify, the automated path this session fixed will actually fire in production.

## 3. Staging smoke (production-grade proof)

Runbook §4.1 requires the full matrix live-smoked on production with a receipt (inbox screenshot + API-container log line) per row — the send-only Resend key can't list sends any other way. That full multi-row smoke needs a complete order lifecycle (checkout → paid → ship → refund) plus B3's admin panel, so it isn't a one-session task. Status as of this session:

- **Rows 1, 2 (order confirmation buyer/seller):** live-verified end-to-end on staging by an earlier session (04/07, real Stripe test-card checkout — see dev zero-context §3 step 4/7). Not re-run this session.
- **Row 7 (account emails) — REAL STAGING SMOKE RUN 05/07/2026:** signed up a real test account on `api.bushpop.xyz` (`bobrien9+bushpoptest@gmail.com`), then called `POST /api/auth/request-password-reset` and `POST /api/auth/send-verification-email` directly. Both returned HTTP 200. API container logs (`docker logs api-w1be995ronuhl7092d4jr392-...`) confirm `[email] Using Resend email sender` / `[email] Resend client initialised` fired on this deploy (not the mock sender), and neither call produced an error — better-auth's route throws a 500 if the `sendResetPassword`/`sendVerificationEmail` callback throws, so a 200 is a genuine send-succeeded signal. **Gap:** couldn't complete the inbox-screenshot half of the receipt this session — the Gmail MCP connector needs a one-time interactive OAuth grant that a headless session can't complete; Ben (or a session with browser access) should confirm the two emails landed in `bobrien9+bushpoptest@gmail.com` to close this out fully.
- **Row 3 (shipping confirmation):** fix verified via integration tests against a real Postgres + BullMQ event dispatch (not mocked); full production proof needs a real order to reach `shipped`, which is better exercised as part of the end-to-end G5 pre-launch checklist once B3's admin panel lands, rather than fabricated in isolation against shared staging data.
- **Row 4 (refund confirmation):** built this session (all 6 completion points, 10 new test assertions — see above); PR held for Ben, so it isn't live on staging yet. Staging smoke rides with the T-0 refund-via-admin-panel step once B3 ships and this PR merges.
- **Rows 5, 6, 8:** pre-existing, internal-only at launch, not re-verified this session.

## 4. Dead-letter queue state after this session's testing

`getFailedEmailJobs()` against staging should read **empty** except for any deliberate test job. This session's DLQ test runs entirely against the local dev stack (`infra/docker-compose.dev.yml`), not staging — it does not leave anything behind on the shared environment.
