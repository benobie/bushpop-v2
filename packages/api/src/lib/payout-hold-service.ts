import { eq, and, gt, lt, count, max, isNull, inArray, sql, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import type Stripe from "stripe";
import {
  db,
  pgClient,
  reservedTransaction,
  type DbExecutor,
  type ReservedSql,
} from "@bushpop/db/client";
import { payoutHolds, orders, sellerProfiles, paymentOperations } from "@bushpop/db/schema";
import type { Order, PayoutHold, PayoutHoldStatus } from "@bushpop/types";
import { ConflictError, NotFoundError } from "./errors.js";
import { transition, InvalidTransitionError } from "./state-machine.js";
import { PAYOUT_HOLD_MACHINE } from "./commerce-machines.js";
import { getStripe } from "./stripe.js";
import {
  createPaymentOp,
  succeedPaymentOp,
  succeedIndeterminateOp,
  markIndeterminate5xx,
  failPaymentOp,
  findLatestTransferOpForHold,
} from "./payment-operations.js";
import { classifyStripeError } from "./refund-service.js";
import { dispatchEvent } from "./events.js";
import { enqueueAdminAlert } from "./admin-alerts.js";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export interface HoldPolicyResult {
  policyName: string;
  releaseEligibleAt: Date;
}

/** Minimal seller profile fields needed for hold policy evaluation. */
export type SellerProfileForPolicy = Pick<
  typeof sellerProfiles.$inferSelect,
  "userId" | "createdAt"
>;

// ---------------------------------------------------------------------------
// CAS helper
// ---------------------------------------------------------------------------

/**
 * Compare-and-set (CAS) transition for a payout hold.
 *
 * Validates that the transition is allowed by PAYOUT_HOLD_MACHINE, then
 * performs an atomic UPDATE WHERE version = $expected AND status = $from.
 * If 0 rows affected, a concurrent writer won — caller receives a
 * ConflictError.
 *
 * @param holdId     - ULID of the payout hold
 * @param fromStatus - Expected current status (machine + WHERE clause guard)
 * @param toStatus   - Desired next status
 * @param version    - Expected version (optimistic concurrency)
 * @param extraSets  - Optional additional columns to update atomically
 * @param tx         - Optional transaction client
 * @param extraWhere - Optional extra predicate AND-ed into the CAS WHERE
 *   clause (e.g. `frozen_at IS NULL` so a freeze can't race a release).
 * @returns New version number on success
 * @throws ConflictError on version mismatch or invalid transition
 */
export async function transitionPayoutHold(
  holdId: string,
  fromStatus: PayoutHoldStatus,
  toStatus: PayoutHoldStatus,
  version: number,
  extraSets?: PgUpdateSetSource<typeof payoutHolds>,
  tx?: DbExecutor,
  extraWhere?: SQL,
): Promise<number> {
  const client = tx ?? db;

  try {
    transition(PAYOUT_HOLD_MACHINE, "payout_hold", fromStatus, toStatus);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      throw new ConflictError(
        `Payout hold transition ${fromStatus} → ${toStatus} is not permitted by the state machine.`,
      );
    }
    throw err;
  }

  const newVersion = version + 1;

  const whereClauses = [
    eq(payoutHolds.id, holdId),
    eq(payoutHolds.status, fromStatus),
    eq(payoutHolds.version, version),
  ];
  if (extraWhere) whereClauses.push(extraWhere);

  const result = await client
    .update(payoutHolds)
    .set({
      ...(extraSets ?? {}),
      status: toStatus,
      version: newVersion,
    })
    .where(and(...whereClauses))
    .returning({ id: payoutHolds.id, version: payoutHolds.version });

  if (result.length === 0) {
    throw new ConflictError(
      "Payout hold was modified by a concurrent request. Please retry with the latest state.",
    );
  }

  return newVersion;
}

// ---------------------------------------------------------------------------
// Freeze
// ---------------------------------------------------------------------------

/**
 * Stable 64-bit advisory-lock key derived from a hold id. Used to serialise a
 * freeze against the freeze re-check that guards `stripe.transfers.create`
 * (HIGH 2 — close the post-CAS freeze race). `pg_advisory_xact_lock` /
 * `pg_advisory_lock` take a single bigint; ULIDs are 26 chars so we fold them
 * into a signed bigint via a deterministic hash. Two distinct holds may very
 * rarely collide on the same lock key — that only ever serialises two unrelated
 * releases, never weakens safety.
 */
function holdAdvisoryKey(holdId: string): string {
  // FNV-1a 64-bit, computed in BigInt, returned as a signed 64-bit decimal
  // string suitable for `pg_advisory_*_lock(bigint)`.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < holdId.length; i++) {
    hash = (hash ^ BigInt(holdId.charCodeAt(i))) & mask;
    hash = (hash * prime) & mask;
  }
  // Map unsigned 64-bit → signed 64-bit (Postgres bigint is signed).
  const signed = hash >= 0x8000000000000000n ? hash - 0x10000000000000000n : hash;
  return signed.toString();
}

/**
 * Why a payout hold was frozen. See the `frozen_reason` column.
 *
 * - `refund`  — a refund was started for this order. May or may not have
 *   reached Stripe; the payment-operations WAL is the only proof.
 * - `dispute` — a chargeback was opened. Never operator-clearable: a won
 *   dispute is unfrozen automatically by the `charge.dispute.closed` webhook,
 *   and a lost one must stay frozen forever.
 */
export type PayoutFreezeReason = "refund" | "dispute";

/**
 * Has any refund for this order possibly moved money at Stripe?
 *
 * `refunds.status` is NOT the source of truth: the finalisation transaction
 * runs AFTER `stripe.refunds.create` returns, so a crash in that window leaves
 * `refunds.status = 'failed'` while Stripe shows a successful refund. The
 * payment-operations WAL records the Stripe call itself, so it is the only
 * honest answer.
 *
 * Returns true (i.e. "assume the money moved") when any refund op for the order
 * is `succeeded`, still `pending`, `indeterminate_5xx`, or was auto-failed
 * without verification. Only a definitively-failed refund op means no money left.
 */
export async function hasReachableRefundAtStripe(orderId: string): Promise<boolean> {
  const rows = await db
    .select({ id: paymentOperations.id })
    .from(paymentOperations)
    .where(
      and(
        eq(paymentOperations.orderId, orderId),
        eq(paymentOperations.type, "refund"),
        sql`NOT (
          ${paymentOperations.status} = 'failed'
          AND (
            ${paymentOperations.failureProvenance} IS NULL
            OR ${paymentOperations.failureProvenance} <> 'auto_timeout_unverified'
          )
        )`,
      ),
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * Freeze a payout hold for an order, setting `frozen_at = now()` and recording
 * WHY via `frozen_reason`.
 *
 * The reason is load-bearing, not decoration. `frozen_at` alone cannot tell a
 * refund that crashed before finalising (money may never have left Stripe — the
 * hold can legitimately be released later) from a chargeback the buyer won (the
 * funds are already gone and the seller must never be paid). Both leave the
 * hold at `status = 'held'`. Only `frozen_reason` distinguishes them, and the
 * admin unfreeze route depends on it.
 *
 * Idempotent — if `frozen_at` is already set, returns without error, except
 * that a `dispute` reason escalates an existing `refund` reason (see below).
 * Called when a dispute or refund event arrives that may claw back funds
 * from a payout already in the `releasing` pipeline.
 *
 * HIGH 2: the write runs inside a transaction that first takes a
 * transaction-scoped advisory lock keyed on the hold (a quick UPDATE, so
 * xact-scoped is fine here). The release path holds the SAME lock key
 * SESSION-scoped on a dedicated connection, continuously from its
 * freeze re-check through `transfers.create` until the hold is finalised. A
 * freeze therefore can never interleave between that re-check and the transfer
 * landing — it either commits fully before the re-check reads it, or blocks on
 * this lock until the release has finished. Frozen holds are also excluded from
 * payout release sweeps in Step 7.
 */
export async function freezePayoutHold(
  orderId: string,
  reason: PayoutFreezeReason,
): Promise<void> {
  const [existing] = await db
    .select({
      id: payoutHolds.id,
      frozenAt: payoutHolds.frozenAt,
      frozenReason: payoutHolds.frozenReason,
    })
    .from(payoutHolds)
    .where(eq(payoutHolds.orderId, orderId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`Payout hold for order ${orderId} not found.`);
  }

  // Idempotent: already frozen.
  //
  // One exception — a `dispute` freeze ESCALATES an existing `refund` freeze.
  // A refund-provenance freeze can legitimately be cleared by an operator once
  // the WAL proves no money left Stripe; a dispute-provenance freeze can never
  // be. If a dispute lands on an order that was already frozen by a refund
  // attempt, the stronger reason must win, or the order would remain
  // operator-unfreezable-into-payment on the weaker one.
  if (existing.frozenAt !== null) {
    if (reason === "dispute" && existing.frozenReason !== "dispute") {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${holdAdvisoryKey(existing.id)}::bigint)`);
        await tx
          .update(payoutHolds)
          .set({ frozenReason: "dispute" })
          .where(eq(payoutHolds.id, existing.id));
      });
    }
    return;
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${holdAdvisoryKey(existing.id)}::bigint)`);
    await tx
      .update(payoutHolds)
      .set({ frozenAt: new Date(), frozenReason: reason })
      .where(and(eq(payoutHolds.id, existing.id), isNull(payoutHolds.frozenAt)));
  });
}

/**
 * Unfreeze a payout hold for an order, clearing `frozen_at` so the release
 * pipeline can resume. Conservative by design: only a still-frozen hold in a
 * releasable state (`held` / `release_failed_retryable`) is unfrozen — a
 * `blocked` (seller-account issue), `released`, or `refunded` hold is left
 * untouched. Used by the `charge.dispute.closed` handler when a dispute is
 * resolved in our favour (`won`); a lost dispute leaves the hold frozen.
 *
 * Idempotent — returns `false` if there was nothing to unfreeze. Takes the same
 * per-hold advisory lock as `freezePayoutHold` / the release path, so it can
 * never interleave with a release's under-lock frozen_at re-check.
 *
 * @returns `true` if a hold row was unfrozen, `false` otherwise.
 */
export async function unfreezePayoutHold(orderId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: payoutHolds.id, frozenAt: payoutHolds.frozenAt })
    .from(payoutHolds)
    .where(eq(payoutHolds.orderId, orderId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`Payout hold for order ${orderId} not found.`);
  }

  // Idempotent: not frozen → nothing to do.
  if (existing.frozenAt === null) {
    return false;
  }

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${holdAdvisoryKey(existing.id)}::bigint)`);
    const cleared = await tx
      .update(payoutHolds)
      .set({ frozenAt: null, frozenReason: null })
      .where(
        and(
          eq(payoutHolds.id, existing.id),
          sql`${payoutHolds.frozenAt} IS NOT NULL`,
          inArray(payoutHolds.status, ["held", "release_failed_retryable"]),
        ),
      )
      .returning({ id: payoutHolds.id });
    return cleared.length > 0;
  });
}

// ---------------------------------------------------------------------------
// Hold policy evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluates the hold policy for a payout and returns the policy name and
 * the earliest timestamp at which the payout is eligible for release.
 *
 * Policy tiers (evaluated in priority order, highest-trust first):
 *
 * 1. **buyer_confirmed** — buyer explicitly confirmed receipt.
 *    Eligible immediately.
 * 2. **new_seller_7d** — seller has fewer than 5 completed orders OR seller
 *    profile is less than 30 days old. Eligible 7 calendar days after delivery.
 * 3. **tracked_3d** — tracking data present (shippingLabelId or trackingNumber).
 *    Eligible 3 calendar days after delivery.
 * 4. **untracked_10bd** — no tracking data. Eligible 10 business days after
 *    delivery (approximated as 14 calendar days).
 *
 * "Delivery" is `order.deliveryConfirmedAt` when available, otherwise
 * `payoutHold.deliveryConfirmedAt`, otherwise falls back to current time
 * (worst-case: just delivered now).
 */
export async function evaluateHoldPolicy(
  order: Order,
  sellerProfile: SellerProfileForPolicy,
  payoutHold: PayoutHold,
): Promise<HoldPolicyResult> {
  const deliveredAt =
    order.deliveryConfirmedAt ??
    payoutHold.deliveryConfirmedAt ??
    new Date();

  // Tier 1: buyer confirmed receipt — release immediately
  if (payoutHold.buyerConfirmedAt !== null) {
    return {
      policyName: "buyer_confirmed",
      releaseEligibleAt: payoutHold.buyerConfirmedAt,
    };
  }

  const hasTracking =
    order.shippingLabelId !== null || order.trackingNumber !== null;

  // Tier 2: new seller — more restrictive than tracked, check before tier 3
  const newSeller = await isNewSeller(sellerProfile.userId);
  if (newSeller) {
    return {
      policyName: "new_seller_7d",
      releaseEligibleAt: addCalendarDays(deliveredAt, 7),
    };
  }

  // Tier 3: tracked — 3 calendar days after delivery
  if (hasTracking) {
    return {
      policyName: "tracked_3d",
      releaseEligibleAt: addCalendarDays(deliveredAt, 3),
    };
  }

  // Tier 4: untracked — 10 business days (~14 calendar days)
  return {
    policyName: "untracked_10bd",
    releaseEligibleAt: addCalendarDays(deliveredAt, 14),
  };
}

// ---------------------------------------------------------------------------
// New seller check
// ---------------------------------------------------------------------------

/**
 * Returns true if the seller is considered "new" for payout hold purposes.
 *
 * A seller is new when EITHER:
 * - Their seller profile is less than 30 days old, OR
 * - They have fewer than 5 completed orders (lifetime).
 */
export async function isNewSeller(sellerId: string): Promise<boolean> {
  const [profile] = await db
    .select({ createdAt: sellerProfiles.createdAt })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, sellerId))
    .limit(1);

  if (!profile) {
    // No profile — treat as new seller (safest default)
    return true;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  if (profile.createdAt > thirtyDaysAgo) {
    return true;
  }

  const [row] = await db
    .select({ completedCount: count() })
    .from(orders)
    .where(
      and(
        eq(orders.sellerId, sellerId),
        eq(orders.status, "completed"),
      ),
    );

  return (row?.completedCount ?? 0) < 5;
}

// ---------------------------------------------------------------------------
// Platform balance
// ---------------------------------------------------------------------------

/**
 * Retrieves the current Stripe platform balance.
 *
 * Returns the available and pending AUD cents.
 * Used by Step 7 (payout release scheduler) to gate releases when the
 * platform reserve is below the minimum threshold.
 */
export async function getPlatformBalance(): Promise<{
  availableCents: number;
  pendingCents: number;
}> {
  const stripe = getStripe();
  const balance = await stripe.balance.retrieve();

  const audCents = (arr: Stripe.Balance.Available[]) =>
    arr
      .filter((b) => b.currency === "aud")
      .reduce((sum, b) => sum + b.amount, 0);

  return {
    availableCents: audCents(balance.available),
    pendingCents: audCents(balance.pending),
  };
}

// ---------------------------------------------------------------------------
// Cash reserve threshold
// ---------------------------------------------------------------------------

/**
 * Computes the minimum platform cash reserve required before releasing payouts.
 *
 * Formula: `max(50000, 2 * highestOrderTotalLast30d)` in cents.
 *
 * This gives a floor of $500 AUD and scales to 2× the largest recent order
 * as a buffer for potential disputes or reversals on high-value orders.
 *
 * Workers in Step 7 call this before each release sweep and skip the payout
 * if `availableBalance - proposedPayout < threshold`.
 */
export async function getCashReserveThreshold(): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [row] = await db
    .select({ highest: max(orders.totalCents) })
    .from(orders)
    .where(gt(orders.createdAt, thirtyDaysAgo));

  // max() returns null when there are no rows
  const highestOrderTotal = row?.highest ?? 0;

  return Math.max(50_000, 2 * highestOrderTotal);
}

// ---------------------------------------------------------------------------
// Shared payout-release core (WS1)
// ---------------------------------------------------------------------------

/** Backoff schedule (minutes) keyed by the just-incremented attempt number. */
const RELEASE_BACKOFF_MINUTES = [0, 5, 30, 120];
const MAX_RELEASE_ATTEMPTS = 3;
/**
 * How far back the List-first guard looks for an already-landed transfer.
 * A prior attempt's 5xx may have created the transfer just before the
 * indeterminate response; a generous window avoids missing it.
 */
const LIST_FIRST_WINDOW_HOURS = 48;

/** Hard ceiling on List-first pagination — defence against an unbounded loop. */
const LIST_FIRST_MAX_PAGES = 50;

export type ReleaseOutcome =
  | { result: "released"; transferId: string }
  | { result: "adopted"; transferId: string }
  | { result: "blocked"; reason: string }
  | { result: "retryable"; reason: string }
  | { result: "manual"; reason: string }
  | { result: "skipped"; reason: string };

/**
 * Paginated List-first lookup for an already-landed transfer (CRITICAL 2).
 *
 * Stripe caps `transfers.list` at 100 per page; a high-volume seller's
 * already-landed transfer can hide on a later page, so a single-page lookup
 * would fall through and create a SECOND transfer. We narrow the query with
 * `transfer_group: orderId` (set on every `transfers.create`) AND `destination`,
 * then paginate via `starting_after` until `has_more === false`.
 *
 * @param predicate - returns true for the transfer we want to adopt
 * @returns the matching transfer, or null if none across all pages
 * @throws if Stripe List fails on any page — the caller MUST NOT create a
 *   transfer on a List failure (would risk a double-pay).
 */
export async function findLandedTransfer(
  stripe: Stripe,
  params: { destination: string; orderId: string; sinceUnix: number },
  predicate: (t: Stripe.Transfer) => boolean,
): Promise<Stripe.Transfer | null> {
  let startingAfter: string | undefined;
  for (let page = 0; page < LIST_FIRST_MAX_PAGES; page++) {
    const res = await stripe.transfers.list({
      destination: params.destination,
      transfer_group: params.orderId,
      created: { gte: params.sinceUnix },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const match = res.data.find(predicate);
    if (match) return match;
    if (!res.has_more || res.data.length === 0) return null;
    startingAfter = res.data[res.data.length - 1]!.id;
  }
  return null;
}

/**
 * Release a held payout to a seller via a Stripe transfer. The single
 * money-safe primitive shared by the admin route and the payout-release
 * worker (WS1).
 *
 * Invariants enforced here:
 *  - `held → releasing` CAS (single winner) with `frozen_at IS NULL` re-checked
 *    *inside* the CAS predicate (closes the dispute-freeze-vs-release race) and
 *    an atomic `release_attempts + 1` increment.
 *  - Per-attempt idempotency key `${holdId}:${attempt}` — never a bare
 *    `holdId`, so a cached Stripe 5xx/4xx can't wedge the hold forever.
 *  - List-first-after-5xx: if the previous attempt's WAL transfer op is
 *    `indeterminate_5xx`, we List transfers and adopt any that already landed
 *    (matched on `metadata.payoutHoldId`) rather than create a second one.
 *  - Every successful release sets BOTH `payout_holds.transferId` AND
 *    `orders.stripeTransferId` (reversibility — the reversal reconciler reads
 *    `orders.stripeTransferId`).
 *  - Alerts are fire-and-forget and never throw into the money path.
 *
 * @param holdId - the payout hold to release
 * @param actor  - the acting admin user id, or `"system"` for the worker
 */
export async function releasePayoutHold(
  holdId: string,
  actor: string,
): Promise<ReleaseOutcome> {
  // 1. Load hold.
  const [hold] = await db
    .select()
    .from(payoutHolds)
    .where(eq(payoutHolds.id, holdId))
    .limit(1);

  if (!hold) {
    throw new NotFoundError(`Payout hold ${holdId} not found.`);
  }

  // Only `held` and `release_failed_retryable` are releasable entry states.
  if (hold.status !== "held" && hold.status !== "release_failed_retryable") {
    return {
      result: "skipped",
      reason: `hold ${holdId} is in status '${hold.status}', not releasable`,
    };
  }

  // Frozen holds are never released (belt — the CAS re-checks too).
  if (hold.frozenAt !== null) {
    return { result: "skipped", reason: `hold ${holdId} is frozen` };
  }

  // 2. Load order + seller profile.
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, hold.orderId))
    .limit(1);

  if (!order) {
    throw new NotFoundError(`Order ${hold.orderId} for hold ${holdId} not found.`);
  }

  const [sellerProfile] = await db
    .select({
      stripeChargesEnabled: sellerProfiles.stripeChargesEnabled,
      stripePayoutsEnabled: sellerProfiles.stripePayoutsEnabled,
      stripeAccountId: sellerProfiles.stripeAccountId,
    })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, order.sellerId))
    .limit(1);

  // 2b. Recheck transferability — block if the seller can't receive funds.
  if (
    !sellerProfile ||
    !sellerProfile.stripeChargesEnabled ||
    !sellerProfile.stripePayoutsEnabled ||
    !sellerProfile.stripeAccountId
  ) {
    const reason = "seller Stripe account is not transferable";
    try {
      await transitionPayoutHold(holdId, hold.status, "blocked", hold.version, {
        failureReason: reason,
      });
    } catch {
      // Concurrent writer won — leave it. The next sweep re-evaluates.
    }
    return { result: "blocked", reason };
  }

  const stripeAccountId = sellerProfile.stripeAccountId;
  // `releaseAttempts` is a MONOTONIC sequence — it is never decremented (HIGH 1).
  // The per-attempt idempotency key therefore always advances, so a cached
  // Stripe failure (e.g. balance_insufficient) can never be replayed forever.
  const attempt = hold.releaseAttempts + 1;
  const idempotencyKey = `${holdId}:${attempt}`;
  // Funding deferrals (balance_insufficient re-queues) advance the key but do
  // NOT count toward the manual-intervention cap. The "real" attempt number for
  // cap purposes excludes prior deferrals.
  const cappableAttempt = attempt - hold.fundingDeferrals;

  // 3. CAS held → releasing with frozen_at re-checked AND release_attempts++.
  let newVersion: number;
  try {
    newVersion = await transitionPayoutHold(
      holdId,
      hold.status,
      "releasing",
      hold.version,
      { releaseAttempts: sql`${payoutHolds.releaseAttempts} + 1` },
      undefined,
      isNull(payoutHolds.frozenAt),
    );
  } catch {
    // Lost the CAS race (concurrent release, freeze, or refund). Safe to skip.
    return { result: "skipped", reason: `hold ${holdId} CAS lost (concurrent change)` };
  }

  const stripe = getStripe();

  // 4. List-first guard: if the prior attempt left an indeterminate_5xx transfer
  // op, a transfer may already have landed. Adopt it instead of creating a new
  // one. Match on metadata.payoutHoldId. The lookup is PAGINATED and scoped by
  // transfer_group=orderId so a high-volume seller's transfer can't hide on a
  // later page (CRITICAL 2).
  const priorOp = await findLatestTransferOpForHold(holdId);
  if (priorOp && priorOp.status === "indeterminate_5xx") {
    const since = Math.floor((Date.now() - LIST_FIRST_WINDOW_HOURS * 3600_000) / 1000);
    let match: Stripe.Transfer | null;
    try {
      match = await findLandedTransfer(
        stripe,
        { destination: stripeAccountId, orderId: hold.orderId, sinceUnix: since },
        (t) => t.metadata?.["payoutHoldId"] === holdId,
      );
    } catch (listErr) {
      // Could not List — do NOT create a transfer (would risk a double-pay).
      // Roll back to retryable and let the next sweep re-List.
      const message = listErr instanceof Error ? listErr.message : String(listErr);
      await markRetryable(holdId, newVersion, cappableAttempt, `List-first failed: ${message}`).catch(() => {});
      return { result: "retryable", reason: `List-first failed: ${message}` };
    }
    if (match) {
      // Adopt the already-landed transfer. CRITICAL 1: WAL-op success +
      // hold finalisation + orders.stripeTransferId commit in ONE transaction so
      // a crash can't leave the op no-longer-indeterminate while the hold has no
      // transferId (which would disable List-first and double-transfer next run).
      await finaliseReleasedHold(holdId, newVersion, hold.orderId, match.id, actor, order.channelId, {
        opId: priorOp.id,
        opKind: "indeterminate",
      });
      return { result: "adopted", transferId: match.id };
    }
  }

  // 5. WAL op + transfer create with the per-attempt idempotency key.
  const op = await createPaymentOp(
    hold.orderId,
    "transfer",
    idempotencyKey,
    hold.amountCents,
  );

  // HIGH 2: the freeze re-check, the Stripe transfer, and the finalisation must
  // all happen while holding the SAME per-hold lock, so a freeze can never
  // commit in the gap between "frozen_at is null" and the transfer actually
  // landing. A transaction-scoped lock would be released the instant its short
  // transaction commits — i.e. BEFORE `transfers.create` runs — leaving the race
  // open. We therefore take a SESSION-scoped advisory lock on a DEDICATED
  // connection (`pgClient.reserve()`), hold it across the network call, and
  // release it (plus the connection) in `finally`.
  //
  // We deliberately do NOT wrap `transfers.create` in a db.transaction: that
  // would pin a *pooled* connection across a network call and risk pool
  // exhaustion. The reserved connection carries only the advisory lock; the
  // finalisation runs as its own short transaction AFTER the transfer returns.
  const lockKey = holdAdvisoryKey(holdId);
  const reserved = await pgClient.reserve();
  let lockHeld = false;
  try {
    // Session-scoped lock on the dedicated connection. `freezePayoutHold` takes
    // the same key (xact-scoped, a quick UPDATE) so it blocks here until we
    // release — it cannot interleave with the re-check → transfer window.
    await reserved`SELECT pg_advisory_lock(${lockKey}::bigint)`;
    lockHeld = true;

    // Freeze re-check UNDER the lock. Read frozen_at on the same reserved
    // connection. If a freeze landed after the entry CAS, abort the release
    // (releasing → held) and do NOT transfer.
    const [frozenRow] = await reserved<{ frozen_at: Date | null }[]>`
      SELECT frozen_at FROM payout_holds WHERE id = ${holdId} LIMIT 1
    `;
    if (frozenRow?.frozen_at != null) {
      await failPaymentOp(op.id, "frozen mid-release").catch(() => {});
      try {
        await transitionPayoutHold(holdId, "releasing", "held", newVersion, {
          failureReason: "frozen mid-release before transfer",
        });
      } catch {
        /* concurrent change — leave it; the hold stays releasing and the next
           sweep skips it because frozen_at is set */
      }
      return { result: "skipped", reason: `hold ${holdId} frozen mid-release` };
    }

    let transfer: Stripe.Transfer;
    try {
      transfer = await stripe.transfers.create(
        {
          amount: hold.amountCents,
          currency: hold.currency.toLowerCase(),
          destination: stripeAccountId,
          transfer_group: hold.orderId,
          metadata: {
            payoutHoldId: holdId,
            orderId: hold.orderId,
            piklo_payment_op_id: op.id,
          },
        },
        { idempotencyKey },
      );
    } catch (err) {
      return await handleTransferError(holdId, newVersion, hold.orderId, op.id, cappableAttempt, err);
    }

    // 6. Success. CRITICAL 1: WAL-op success + hold finalisation + order column
    // commit in ONE transaction (atomic close of the double-transfer crash
    // window). Still inside the advisory lock so the freeze stays serialised
    // until the hold is finalised. The finalisation transaction runs on the
    // SAME `reserved` connection that holds the lock, so this whole locked
    // critical section uses exactly ONE pool connection — a second pooled
    // `db.transaction()` here would need two connections from the same pool at
    // once and could self-deadlock under concurrent admin releases (with the
    // `finally` then never reached, leaking the advisory lock forever).
    await finaliseReleasedHold(
      holdId,
      newVersion,
      hold.orderId,
      transfer.id,
      actor,
      order.channelId,
      { opId: op.id, opKind: "pending" },
      reserved,
    );
    return { result: "released", transferId: transfer.id };
  } finally {
    // CRITICAL: always release the session lock and the dedicated connection,
    // even on throw/timeout — otherwise the lock leaks and every future release
    // (and freeze) on this hold blocks forever.
    if (lockHeld) {
      await reserved`SELECT pg_advisory_unlock(${lockKey}::bigint)`.catch(() => {});
    }
    reserved.release();
  }
}

/**
 * Finalise a released hold atomically (CRITICAL 1).
 *
 * In ONE DB transaction:
 *  - mark the WAL transfer op `succeeded` (pending → succeeded, or
 *    indeterminate_5xx → succeeded depending on `opKind`),
 *  - CAS the hold releasing → released (set transferId),
 *  - set `orders.stripeTransferId` (reversibility — the reversal reconciler
 *    reads it).
 *
 * Because all three commit together, a crash can never leave the op
 * no-longer-indeterminate while the hold has no transferId (the state that
 * would disable the next List-first guard and allow a second transfer).
 *
 * Then fire-and-forget `payout.released`.
 */
async function finaliseReleasedHold(
  holdId: string,
  version: number,
  orderId: string,
  transferId: string,
  actor: string,
  channelId: string,
  op: { opId: string; opKind: "pending" | "indeterminate" },
  reserved?: ReservedSql,
): Promise<void> {
  // The atomic finalisation body. `executor` is whichever transaction client
  // the caller pinned us to — either a normal pooled `db.transaction` tx, or a
  // transaction running on the caller's ALREADY-RESERVED connection.
  const body = async (executor: DbExecutor): Promise<void> => {
    if (op.opKind === "indeterminate") {
      await succeedIndeterminateOp(op.opId, transferId, executor);
    } else {
      await succeedPaymentOp(op.opId, transferId, executor);
    }
    await transitionPayoutHold(
      holdId,
      "releasing",
      "released",
      version,
      { transferId },
      executor,
    );
    // Reversibility invariant: the reversal reconciler reads orders.stripeTransferId.
    await executor
      .update(orders)
      .set({ stripeTransferId: transferId })
      .where(eq(orders.id, orderId));
  };

  if (reserved) {
    // Single-connection path (CRITICAL 1 + HIGH 2): the success path already
    // holds a session-scoped advisory lock on `reserved`. Run the finalisation
    // transaction on that SAME connection so the whole locked critical section
    // uses exactly ONE pool connection — never a second pooled connection that
    // could self-deadlock the pool under concurrent admin releases.
    await reservedTransaction(reserved, body);
  } else {
    // Pooled path (e.g. the adopt branch, which is not holding a reserved
    // connection): a normal pooled transaction is correct.
    await db.transaction(body);
  }

  dispatchEvent({
    eventName: "payout.released",
    category: "payout",
    actorId: actor,
    entityType: "payout_hold",
    entityId: holdId,
    channelId,
    metadata: { transferId },
  }).catch((err) => {
    console.error("[payout-hold-service] Failed to dispatch payout.released:", err);
  });
}

/**
 * Map a Stripe transfer-create error onto a hold transition. The WAL op is
 * marked according to its classification; the hold lands in a recoverable
 * state. Alerts never throw (invariant 7).
 */
async function handleTransferError(
  holdId: string,
  version: number,
  _orderId: string,
  opId: string,
  attempt: number,
  err: unknown,
): Promise<ReleaseOutcome> {
  const { kind, message } = classifyStripeError(err);

  if (kind === "indeterminate_5xx") {
    // Indeterminate — leave the op as indeterminate_5xx so the next attempt is
    // List-first. Hold → release_failed_retryable with backoff.
    await markIndeterminate5xx(opId, message).catch(() => {});
    await markRetryable(holdId, version, attempt, message).catch(() => {});
    return { result: "retryable", reason: `5xx: ${message}` };
  }

  if (kind === "balance_insufficient") {
    // Platform funding issue, not the seller's fault — back to held without
    // burning the manual cap. The reserve gate catches it next cycle.
    //
    // HIGH 1: do NOT decrement releaseAttempts (that would reuse the same
    // idempotency key on the next retry and replay this cached failure forever).
    // The attempt sequence stays monotonic; instead we bump funding_deferrals so
    // this re-queue does not count toward MAX_RELEASE_ATTEMPTS (cappableAttempt
    // = releaseAttempts - fundingDeferrals).
    await failPaymentOp(opId, message).catch(() => {});
    try {
      await transitionPayoutHold(holdId, "releasing", "held", version, {
        fundingDeferrals: sql`${payoutHolds.fundingDeferrals} + 1`,
        failureReason: message,
      });
    } catch {
      /* concurrent change — leave it */
    }
    return { result: "skipped", reason: `balance_insufficient: ${message}` };
  }

  if (kind === "idempotency_error") {
    // Cross-row key collision — never silent-retry. Manual escalation.
    await failPaymentOp(opId, message).catch(() => {});
    await markManual(holdId, version, message).catch(() => {});
    return { result: "manual", reason: `idempotency_error: ${message}` };
  }

  // deterministic_4xx (account_restricted, etc.) — retryable until the cap.
  await failPaymentOp(opId, message).catch(() => {});
  if (attempt >= MAX_RELEASE_ATTEMPTS) {
    await markManual(holdId, version, message).catch(() => {});
    return { result: "manual", reason: `attempt cap reached: ${message}` };
  }
  await markRetryable(holdId, version, attempt, message).catch(() => {});
  return { result: "retryable", reason: message };
}

/** CAS releasing → release_failed_retryable with backoff, or → manual at cap. */
async function markRetryable(
  holdId: string,
  version: number,
  attempt: number,
  reason: string,
): Promise<void> {
  if (attempt >= MAX_RELEASE_ATTEMPTS) {
    await markManual(holdId, version, reason);
    return;
  }
  const backoff = RELEASE_BACKOFF_MINUTES[attempt] ?? 120;
  const nextRetryAt = new Date(Date.now() + backoff * 60_000);
  await transitionPayoutHold(holdId, "releasing", "release_failed_retryable", version, {
    nextRetryAt,
    failureReason: reason,
  });
}

/** CAS releasing → release_failed_manual + fire an admin alert (never throws). */
async function markManual(
  holdId: string,
  version: number,
  reason: string,
): Promise<void> {
  await transitionPayoutHold(holdId, "releasing", "release_failed_manual", version, {
    failureReason: reason,
  });
  await enqueueAdminAlert({
    type: "payout_release_failed_manual",
    holdId,
    reason,
  }).catch((alertErr) => {
    console.error("[payout-hold-service] admin alert failed:", alertErr);
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
