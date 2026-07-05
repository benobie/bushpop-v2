# Counterfeit Takedown Process — G8 launch gate

**Created:** 05/07/2026 (batch 38, session C) · **Status:** INTERNAL OPERATING DOC — not for public publication as-written · **Scope:** Phase-1 single-seller launch compliance (G8 in `~/projects/Bushpop/docs/cutover/launch2-runbook.md`)

---

## 0. Scope & guardrails

Bushpop's marketplace features Bushpop-owned listings in Phase 1 (single-seller mode). Counterfeit claims on Phase-1 inventory are handled via this process. When multi-vendor launches (Phase 2), seller-listing counterfeit claims follow the same intake path and SLA but route to a seller-dispute handler; that path is defined later.

**Standing legal rule:** Bushpop is **NOT a safe harbour provider** — under Australian law (leveraging Redbubble precedent, `~/projects/Bushpop/docs/HANDOFF-ZERO-CONTEXT.md` §10), a marketplace listing counterfeit items, even inadvertently, exposes Bushpop to liability. There is **no "notify and wait" option**. Any credible counterfeit claim triggers an immediate takedown and investigation, not a seller-affordance window. (See the evidence pack `docs/payments-evidence-pack-2026-07.md` for how this posture is documented for Stripe.)

---

## 1. Report intake

### Paths to report

1. **Email:** support@bushpop.com.au (the monitored public mailbox; during Phase 1, one support person)
2. **In-app form:** [DRAFT — form route TBD at U4 build time; initially email-only] (link this once the form ships)

### Required information from the reporter

- **Listing URL or ID** — which item is allegedly counterfeit
- **Alleged brand** — the brand the item claims to be
- **Claim detail** — why they believe it is counterfeit (e.g. "stitching pattern wrong", "logo placement doesn't match retail", "hologram missing")
- **Reporter contact** — email, for the resolution update

If a report is incomplete, respond within 4 business hours requesting the missing info; the clock restarts when the reporter supplies it. (See the support playbook `~/projects/Bushpop/docs/BRIEF-support-playbook.md` for the canned-response templates and escalation tree.)

---

## 2. Investigation & takedown (24-hour SLA)

### Timeline (all times Sydney)

**Upon receipt (< 4 business hours):**
1. **Log the claim** in the evidence ledger (see §3).
2. **Acknowledge receipt** via email — same-day response, "We've received your report and are investigating immediately."
3. **Freeze the listing** in the marketplace (set `is_live = false`, preserve the row). Record the freeze timestamp.

**Hours 0–24 (same business day + next morning if after-hours):**
1. **Inspect the item** against the alleged brand's known features. Do NOT rely solely on seller claims about authenticity.
   - For major brands (Nike, Adidas, etc.), consult public authentication guides if available.
   - For designer items, check logo placement, stitching, serial numbers, material feel, weight.
   - If Bushpop sourced the item (Phase 1), physical inspection is mandatory; photograph the item from multiple angles.
   - If the evidence is inconclusive, escalate (see §4).
2. **Notify the seller** (if Phase 2, seller mode) that the listing is frozen pending investigation.
3. **Resolve the claim:** either (a) **confirm counterfeit** and proceed to §3, or (b) **refute the claim** and reactivate the listing (see below).

### Refuting a counterfeit claim

If the investigation finds the item is **authentic**:
1. Email the reporter explaining why (e.g. "stitching pattern matches the official 2024 retail version").
2. Reactivate the listing (`is_live = true`).
3. Log the resolution in the evidence ledger.
4. No further action.

**Note:** Do NOT publicly announce "we investigated and it's real" — the reporter may contact the brand directly, and contradicting them publicly weakens Bushpop's credibility. A private explanation to the reporter is sufficient.

---

## 3. Confirmed counterfeit — resolution

If the item **IS counterfeit:**

1. **Issue a refund** to the buyer (the person who purchased the item from Bushpop).
   - Use the standard Stripe refund API (never a manual bank transfer).
   - Process within 2 business days of confirmation.
   - Send the buyer an email: "Your order has been refunded due to a product quality issue. The refund will appear in your account within 5–10 business days depending on your bank."

2. **Notify the seller** (Phase 1 = Bushpop internally; Phase 2 = seller message):
   - Phase 1: log the finding internally (see §3a below).
   - Phase 2: send a formal counterfeit notice with evidence, demand removal, and copy the seller on the refund notification (see the playbook §6 claim-handling matrix).

3. **Destroy or quarantine the physical item** (Phase 1 only).
   - Photograph it (for the evidence ledger) and destroy it, OR
   - Quarantine it in a separate physical location with the case number noted, to preserve for any future dispute (recommended for high-value items).

4. **Update the listing record:**
   - Set `is_live = false` and `delisted_reason = 'counterfeit'` (new DB column, see §3a).
   - Do NOT delete the listing row — it is evidence.

5. **Email the reporter:**
   - "We have confirmed the item is counterfeit and have removed it from the marketplace. The buyer has been refunded. Thank you for reporting this."

### 3a. Evidence ledger & retention

**Storage:** a new `counterfeit_claims` table in the main Postgres DB:

```sql
CREATE TABLE counterfeit_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  claim_date TIMESTAMP NOT NULL,
  claimed_by_email TEXT,
  claim_detail TEXT,
  investigation_notes TEXT,
  resolved_at TIMESTAMP,
  resolved_as 'counterfeit' | 'authentic' | 'inconclusive',
  refund_tx_id TEXT,  -- Stripe refund ID
  destroyed_at TIMESTAMP,
  photos_url TEXT,  -- path to evidence photos (R2 or local)
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE listings ADD COLUMN delisted_reason TEXT;
```

**Retention:** keep all rows indefinitely (evidence for potential regulatory inquiries or fraud patterns). Flag rows with `resolved_as = 'counterfeit'` for monthly review (see §4).

**Who has access:**
- Bushpop staff (read-write): the support account and any admin role.
- Stripe (read, via the evidence pack data): count of confirmed counterfeits informs the evidence pack's "dispute rate" metric.
- Never a seller (read-only until Phase 2 multi-vendor matures, then a seller sees only claims about their own listings).

---

## 4. Escalation & edge cases

### Inconclusive findings

If the investigation cannot determine authenticity (e.g. a lesser-known brand with no public authentication guide):

1. **Hold the freeze** (listing stays `is_live = false`).
2. **Contact the brand** (if possible) — ask them directly whether the item matches their current retail spec.
3. **Wait up to 3 business days** for the brand to respond.
4. If the brand confirms counterfeit → resolve as counterfeit (§3).
5. If the brand confirms authentic OR does not respond → resolve as authentic, reactivate, and log the outcome.

### Multiple claims on the same listing

If two or more independent reporters flag the same listing:
- Treat this as heightened confidence that the item is counterfeit.
- Escalate to immediate takedown (do not wait for the full investigation).
- Log all claims in the evidence ledger with cross-references.

### Abuse of the process

If a reporter repeatedly submits false counterfeit claims (pattern of at least 3 refuted claims from the same email address within 30 days):
- Do not process new reports from that email address until they contact support to resolve the pattern.
- Log the pattern in the evidence ledger as `resolved_as = 'abuse'`.
- Do not block the reporter permanently — dispute resolution is always available via support@bushpop.com.au, but automated intake stops.

---

## 5. Internal checklist (per claim)

Copy this checklist into every evidence ledger entry:

- [ ] Claim logged with timestamp and reporter email
- [ ] Listing frozen (`is_live = false`)
- [ ] Acknowledgment email sent (same business day)
- [ ] Investigation completed (evidence photos taken, brand guides consulted, physical item inspected if Phase 1)
- [ ] Determination made (counterfeit / authentic / inconclusive)
- [ ] **If counterfeit:**
  - [ ] Refund issued via Stripe API
  - [ ] Refund email sent to buyer
  - [ ] Seller notification sent (or internal log if Phase 1)
  - [ ] Physical item destroyed or quarantined
  - [ ] Listing marked `delisted_reason = 'counterfeit'`
  - [ ] Reporter confirmation email sent
  - [ ] Evidence ledger row finalized (photos, notes, refund TX ID)
- [ ] **If authentic or inconclusive:**
  - [ ] Listing reactivated (`is_live = true`)
  - [ ] Reporter explanation email sent
  - [ ] Evidence ledger row closed

---

## 6. Trust-claims gate (before publishing any public-facing version)

This document is **INTERNAL OPERATING POLICY**. When U4 (the trust/content pages track) builds the public-facing help page or counterfeit FAQ, the following must pass the trust-claims ledger gate (see `bushpop-v2/docs/trust-claims-ledger.md`):

- **Any claim about "what we do if you report a counterfeit"** — use the language in §2/§3 but adapted for a buyer audience (simpler, no internal jargon).
- **Any claim about "how long it takes"** — cite the 24-hour SLA, but note that the buyer's refund appears on their card on their bank's timeline (5–10 business days), not ours.
- **Any claim about "we remove counterfeits"** — this is honest and appropriate to state, but the support playbook's claim-handling matrix (§6) is the authoritative wording for public surfaces.

Nothing in this doc should be copied verbatim to a customer-facing page. Rewrite for clarity and warmth, then gate the rewrite.

---

## 7. Monitoring & metrics

**Monthly review (first-of-month check-in):**

1. Count the month's claims: total, confirmed counterfeits, refuted, inconclusive.
2. Flag any patterns (same brand repeatedly, same reporter, same sourcing channel if Phase 2).
3. If counterfeits > 5 in a month, escalate to the product lead for sourcing review.
4. Log the monthly summary in a memo to the founder.

**Stripe reporting:**
The evidence pack `docs/payments-evidence-pack-2026-07.pdf` commits to a dispute rate ≤ 0.75% (1 dispute per ~134 orders). A confirmed counterfeit → refund → buyer does not open a dispute if the buyer receives the refund before they escalate to their bank. This process directly supports that commitment: fast takedown = no dispute escalation.

---

## 8. Implementation (Phase 1 launch readiness)

**Before T-0 (go-live):**

- [ ] Table `counterfeit_claims` and column `listings.delisted_reason` deployed to production DB.
- [ ] Email template for "we've received your report" lives in the transactional-email template set (`bushpop-v2/docs/email-matrix.md`).
- [ ] `support@bushpop.com.au` is monitored by the support person (configured in Chatwoot or mailbox, depending on U4's choice for Q8).
- [ ] This doc linked in the internal Slack / onboarding so the support person knows the process.
- [x] Product page / FAQ section "Reporting counterfeits" — **BUILT 05/07/2026** as `apps/market` route `/help/report-counterfeit` (`bushpop-v2` PR #77, HELD for Ben, not yet merged/live). Do not treat as linked-from-the-public-site until that PR merges.

**At T+7d (post-canary check-in):**

- [ ] First counterfeit claim (if any) has been processed end-to-end successfully.
- [ ] The evidence ledger has at least one real row (or zero claims if none were received).
- [x] The U4 trust-gate build — **done 05/07/2026**, see above; still needs Ben's merge to actually go live.

---

## 9. Out of scope (Phase 2 / later)

- **Seller escalation routing** — when Phase 2 enables multi-vendor, seller counterfeit claims follow the same intake but route to a seller-dispute handler with its own SLA and escalation tree.
- **Brand partnership programs** — future opportunities for brands to flag their own items for authentication pre-listing.
- **Buyer authentication option** — parked in the W3 handoff; if enabled later, this process escalates to "optional buyer authentication request" before takedown.

---

**Internal use only. Do not share outside Bushpop without redacting sensitive findings.**
