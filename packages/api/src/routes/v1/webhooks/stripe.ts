import type { FastifyInstance } from "fastify";
import rawBody from "fastify-raw-body";
import Stripe from "stripe";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  checkoutSessions,
  orders,
  orderItems,
  cartItems,
  inventoryItems,
  channelListings,
  payoutHolds,
  sellerProfiles,
  addresses,
} from "@bushpop/db/schema";
import { getStripe } from "../../../lib/stripe.js";
import {
  isWebhookProcessed,
  markWebhookProcessed,
  deadLetterWebhook,
} from "../../../lib/webhook-dedup.js";
import { syncAccountFromWebhook } from "../seller/stripe/service.js";
import { releaseItems } from "../../../lib/inventory-reservation.js";
import { cascadeLifecycleToListings } from "../../../lib/inventory-invariants.js";
import { dispatchEvent } from "../../../lib/events.js";
import { handlePaymentAfterExpiry } from "../store/checkout/service.js";
import { enqueueEmail } from "../../../workers/email.js";
import { enqueueShippingLabel } from "../../../workers/shipping-label.js";
import {
  reconcileRefundOpFromStripe,
  reconcileReversalOpFromStripe,
} from "../../../lib/refund-service.js";
import { freezePayoutHold, unfreezePayoutHold } from "../../../lib/payout-hold-service.js";
import { enqueueAdminAlert } from "../../../lib/admin-alerts.js";

const PROVIDER = "stripe";

export async function stripeWebhookRoutes(app: FastifyInstance) {
  // Register fastify-raw-body scoped to this plugin only (global: false).
  // This makes request.rawBody available for Stripe signature verification.
  await app.register(rawBody, {
    global: false,
    encoding: "utf8",
    runFirst: true,
  });

  // POST /api/v1/webhooks/stripe
  // No auth — Stripe signature verification is the security mechanism.
  app.post("/api/v1/webhooks/stripe", {
    config: { rawBody: true, rateLimit: { max: 300, timeWindow: "1 minute" } },
    schema: {
      tags: ["Webhooks"],
      summary: "Stripe webhook receiver",
      // No body schema — raw body is consumed for signature verification
    },
  }, async (request, reply) => {
    const sigHeader = request.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    if (!sigHeader) {
      return reply.status(400).send({ error: "Missing stripe-signature header" });
    }

    // Fastify headers can be string | string[] — Stripe expects a single string
    const sig = Array.isArray(sigHeader) ? sigHeader[0]! : sigHeader;

    const rawBodyStr = (request as unknown as { rawBody: string }).rawBody;

    if (!rawBodyStr) {
      return reply.status(400).send({ error: "Missing raw body" });
    }

    let event: Stripe.Event;

    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(rawBodyStr, sig, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Signature verification failed";
      request.log.warn({ err }, "Stripe webhook signature verification failed");
      return reply.status(400).send({ error: `Webhook signature verification failed: ${message}` });
    }

    // Dedup — ignore already-processed events
    const alreadyProcessed = await isWebhookProcessed(PROVIDER, event.id);
    if (alreadyProcessed) {
      return reply.status(200).send({ received: true, duplicate: true });
    }

    // Dispatch event
    try {
      await handleStripeEvent(event);
      await markWebhookProcessed(PROVIDER, event.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      request.log.error({ err, eventId: event.id, eventType: event.type }, "Stripe webhook handler failed");
      await deadLetterWebhook(PROVIDER, event.type, event, message);
      return reply.status(500).send({ error: "Webhook handler failed" });
    }

    return reply.status(200).send({ received: true });
  });
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await syncAccountFromWebhook(account.id, {
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      });
      break;
    }

    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentIntentSucceeded(pi);
      break;
    }

    case "payment_intent.requires_action": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentIntentRequiresAction(pi);
      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentIntentFailed(pi);
      break;
    }

    // LB-3 (R1): out-of-band reconciliation for refund/reversal payment_ops
    // left in `indeterminate_5xx` after a Stripe 5xx. Each handler is
    // idempotent — the CAS in `succeedIndeterminateOp` returns null on
    // repeated deliveries and the reconcile helpers short-circuit cleanly.
    case "refund.created":
    case "refund.updated": {
      const refund = event.data.object as Stripe.Refund;
      await handleStripeRefundWebhook(refund);
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      await handleChargeRefundedWebhook(charge);
      break;
    }

    case "transfer.updated": {
      // Stripe does not emit a discrete `transfer.reversal.created` event;
      // reversals are surfaced via `transfer.updated` where the transfer
      // object's `reversals.data` list has grown. The handler iterates any
      // reversals carrying our `piklo_payment_op_id` metadata and reconciles
      // them through the shared helper (idempotent via CAS).
      const transfer = event.data.object as Stripe.Transfer;
      await handleTransferReversalWebhook(transfer);
      break;
    }

    // M1: chargeback (dispute) handling. `created` freezes the order's payout
    // hold so disputed proceeds can't be released to the seller; `closed`
    // conservatively unfreezes only on a `won` outcome. Both alert an operator.
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      await handleChargeDisputeCreated(dispute);
      break;
    }

    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      await handleChargeDisputeClosed(dispute);
      break;
    }

    default:
      // Unhandled events — log and ignore (not an error)
      break;
  }
}

// ---------------------------------------------------------------------------
// LB-3 refund/reversal webhook reconciliation handlers
// ---------------------------------------------------------------------------

async function handleStripeRefundWebhook(refund: Stripe.Refund): Promise<void> {
  const opId = readPikloOpId(refund.metadata);
  if (!opId) {
    console.info(
      `[webhook] ${refund.object === "refund" ? "refund.created" : "refund"} without piklo_payment_op_id — ignoring (id=${refund.id})`,
    );
    return;
  }
  await reconcileRefundOpFromStripe(opId, refund.id);
}

async function handleChargeRefundedWebhook(charge: Stripe.Charge): Promise<void> {
  // charge.refunded carries the full refunds list; reconcile each that has
  // our piklo_payment_op_id metadata. Non-piklo refunds are ignored.
  const refundsList = charge.refunds?.data ?? [];
  for (const refund of refundsList) {
    const opId = readPikloOpId(refund.metadata);
    if (!opId) continue;
    try {
      await reconcileRefundOpFromStripe(opId, refund.id);
    } catch (err) {
      console.error(
        `[webhook] charge.refunded reconcile failed for op ${opId}:`,
        err instanceof Error ? err.message : err,
      );
      throw err;
    }
  }
}

async function handleTransferReversalWebhook(transfer: Stripe.Transfer): Promise<void> {
  // Each reversal on the transfer carries its own metadata. Reconcile any
  // that reference one of our payment_ops.
  const reversals = transfer.reversals?.data ?? [];
  for (const reversal of reversals) {
    const opId = readPikloOpId(reversal.metadata);
    if (!opId) continue;
    try {
      await reconcileReversalOpFromStripe(opId, reversal.id);
    } catch (err) {
      console.error(
        `[webhook] transfer.reversal.created reconcile failed for op ${opId}:`,
        err instanceof Error ? err.message : err,
      );
      throw err;
    }
  }
}

function readPikloOpId(metadata: Stripe.Metadata | null | undefined): string | null {
  if (!metadata) return null;
  const v = metadata["piklo_payment_op_id"];
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ---------------------------------------------------------------------------
// M1 — dispute (chargeback) handlers
// ---------------------------------------------------------------------------

/**
 * Resolve a Stripe dispute to one of our orders via its PaymentIntent
 * (`orders.stripe_payment_intent_id`). Returns null if the dispute carries no
 * PaymentIntent we own — a dispute on a non-Bushpop charge is ignored, not an
 * error.
 */
async function resolveOrderIdFromDispute(dispute: Stripe.Dispute): Promise<string | null> {
  const piId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : (dispute.payment_intent?.id ?? null);
  if (!piId) return null;

  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.stripePaymentIntentId, piId))
    .limit(1);

  return order?.id ?? null;
}

/**
 * `charge.dispute.created` — a chargeback was opened. Freeze the order's payout
 * hold immediately so the disputed proceeds can't be released to the seller
 * while the dispute is open (combined with H1's freeze wiring, this closes the
 * "disputed funds released to seller" gap), and alert an operator.
 *
 * Idempotent: the webhook dedup layer plus `freezePayoutHold`'s own idempotency
 * make redelivery a no-op. The alert fires first so a dispute is always visible
 * to operators even if the freeze hits a transient DB error and the webhook
 * retries.
 */
async function handleChargeDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  const orderId = await resolveOrderIdFromDispute(dispute);
  if (!orderId) {
    console.warn(`[webhook] charge.dispute.created ${dispute.id} — no matching Bushpop order; ignoring`);
    return;
  }

  await enqueueAdminAlert({
    type: "dispute_created",
    orderId,
    disputeId: dispute.id,
    reason: dispute.reason,
    amountCents: dispute.amount,
    currency: dispute.currency,
  });

  // `dispute` provenance is permanent as far as the admin unfreeze route is
  // concerned: a WON dispute is unfrozen by charge.dispute.closed below; a LOST
  // one must stay frozen forever, because the funds have already left the
  // platform via the chargeback.
  await freezePayoutHold(orderId, "dispute");
  console.info(`[webhook] charge.dispute.created ${dispute.id} — froze payout hold for order ${orderId}`);
}

/**
 * `charge.dispute.closed` — the dispute resolved. Conservative policy: only a
 * `won` outcome unfreezes the hold (and only if it's still frozen and in a
 * releasable state — see `unfreezePayoutHold`); `lost` (or any other terminal
 * status) leaves the hold frozen, because the funds have already left our
 * platform via the chargeback and must not be paid to the seller as well.
 * Always alerts an operator with the resolution.
 */
async function handleChargeDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
  const orderId = await resolveOrderIdFromDispute(dispute);
  if (!orderId) {
    console.warn(`[webhook] charge.dispute.closed ${dispute.id} — no matching Bushpop order; ignoring`);
    return;
  }

  const won = dispute.status === "won";
  const unfroze = won ? await unfreezePayoutHold(orderId) : false;

  await enqueueAdminAlert({
    type: "dispute_closed",
    orderId,
    disputeId: dispute.id,
    resolution: dispute.status,
    unfroze,
    amountCents: dispute.amount,
    currency: dispute.currency,
  });

  console.info(
    `[webhook] charge.dispute.closed ${dispute.id} for order ${orderId} — status=${dispute.status}, unfroze=${unfroze}`,
  );
}

// ---------------------------------------------------------------------------
// payment_intent.succeeded handler
// ---------------------------------------------------------------------------

type CheckoutSessionRow = typeof checkoutSessions.$inferSelect;

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  // 1. Look up checkout session by stripe_payment_intent_id
  const [session] = await db
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.stripePaymentIntentId, pi.id));

  if (!session) {
    console.warn(`[webhook] No checkout session found for PaymentIntent ${pi.id}`);
    return;
  }

  // 1b. Money invariant: what Stripe captured must equal what we quoted.
  //
  // Today the PaymentIntent is created server-side from the same `totals`
  // object persisted onto the session, so this can only fire on a bug or on an
  // out-of-band mutation of the PI. It is asserted anyway because every
  // downstream money field — the order rows, the payout hold, the refund
  // amount on the expiry path — is read from the SESSION, never from the
  // charge. The moment a second PI-creation path exists (multi-vendor, partial
  // capture) the absence of this check becomes load-bearing.
  //
  // Fail closed: throw rather than fulfil. The event is not marked processed,
  // so Stripe redelivers and the mismatch surfaces as a stuck webhook rather
  // than as a silently under-collected order.
  if (pi.amount !== session.totalCents || pi.currency.toUpperCase() !== session.currency.toUpperCase()) {
    console.error(
      `[webhook] MONEY MISMATCH for session ${session.id}: PaymentIntent ${pi.id} is ` +
        `${pi.amount} ${pi.currency.toUpperCase()} but the session quoted ` +
        `${session.totalCents} ${session.currency.toUpperCase()}. Refusing to fulfil.`,
    );
    throw new Error(
      `PaymentIntent ${pi.id} amount/currency does not match checkout session ${session.id}`,
    );
  }

  // 2. Idempotency / AUDIT-003 recovery: if the session is already `succeeded`,
  // a prior delivery won the CAS. Either the order exists (normal idempotent
  // replay) or the runner crashed AFTER the CAS but BEFORE inserting the order
  // (AUDIT-003: money captured, no order). The orders INSERT is the
  // linearisation point, so we can safely re-attempt order creation here — the
  // cart_items are intact (the delete only lives inside the never-committed tx).
  if (session.status === "succeeded") {
    const [existingOrder] = await db
      .select({
        id: orders.id,
        jobsEnqueuedAt: orders.jobsEnqueuedAt,
        buyerId: orders.buyerId,
        sellerId: orders.sellerId,
        channelId: orders.channelId,
      })
      .from(orders)
      .where(eq(orders.checkoutSessionId, session.id));

    if (existingOrder) {
      // AUDIT-010: the order exists but jobs were never enqueued (crash between
      // the order commit and enqueueOrderJobs). Re-run the deduped enqueue so
      // the buyer/seller emails + shipping label aren't permanently skipped.
      if (existingOrder.jobsEnqueuedAt === null) {
        console.warn(`[webhook] AUDIT-010: order ${existingOrder.id} has no jobs_enqueued_at — re-enqueuing`);
        await enqueueOrderJobs(
          existingOrder.id,
          existingOrder.buyerId,
          existingOrder.sellerId,
          existingOrder.channelId,
        );
      } else {
        console.info(`[webhook] Duplicate payment_intent.succeeded for session ${session.id} — returning existing order ${existingOrder.id}`);
      }
      return;
    }

    // AUDIT-003 recovery: succeeded + no order. Re-create directly (the session
    // CAS already happened — skip it). createOrderForSession is idempotent via
    // the orders.checkout_session_id unique linearisation point.
    console.warn(`[webhook] AUDIT-003 recovery: session ${session.id} is succeeded but has no order — recreating`);
    await createOrderForSession(session, pi);
    return;
  }

  // 3. Handle payment-after-expiry: session is expired → invoke compensation flow
  if (session.status === "expired") {
    const outcome = await handlePaymentAfterExpiry(session.id, pi.id);
    if (outcome === "refunded") {
      console.info(`[webhook] Payment-after-expiry: auto-refunded for session ${session.id}`);
      return;
    }
    // outcome === "reactivated" — fall through to order creation
  } else if (!["payment_pending", "requires_action"].includes(session.status)) {
    // Already in a terminal state other than expired/succeeded — skip
    console.warn(`[webhook] Skipping payment_intent.succeeded: session ${session.id} is in status '${session.status}'`);
    return;
  }

  // 4. Transition session → succeeded (compare-and-set)
  const allowedFromStatuses = ["payment_pending", "requires_action", "expired"];
  const casResult = await db
    .update(checkoutSessions)
    .set({
      status: "succeeded",
      version: sql`${checkoutSessions.version} + 1`,
    })
    .where(
      and(
        eq(checkoutSessions.id, session.id),
        eq(checkoutSessions.version, session.version),
        inArray(checkoutSessions.status, allowedFromStatuses),
      ),
    )
    .returning({ id: checkoutSessions.id });

  if (casResult.length === 0) {
    console.warn(`[webhook] CAS failed for session ${session.id} — concurrent transition`);
    return;
  }

  // 5. Normal path — create the order (linearised on orders.checkout_session_id).
  await createOrderForSession(session, pi);
}

/**
 * Create the order + side effects for a `succeeded` checkout session.
 *
 * AUDIT-003: the orders INSERT (guarded by `orders_checkout_session_id_unique`
 * via `onConflictDoNothing`) is the LINEARISATION POINT. Only the runner that
 * wins the insert performs side effects (inventory sold, payout_hold, cart
 * delete, events, jobs). A runner that loses the insert (concurrent delivery,
 * or this being a crash-recovery re-attempt where another runner already
 * created the order) returns early WITHOUT touching inventory / payout_holds /
 * cart_items. This sidesteps the payout_holds UNIQUE(orderId) collision — only
 * one runner ever inserts the hold.
 *
 * Safe to call:
 *  - on the normal path (after a winning session CAS), and
 *  - on the AUDIT-003 recovery path (session already `succeeded`, no order).
 */
async function createOrderForSession(
  session: CheckoutSessionRow,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  // Get cart items with listing + inventory data
  const cartItemRows = await db
    .select({
      channelListingId: cartItems.channelListingId,
      priceCents: cartItems.priceCents,
      currency: cartItems.currency,
      inventoryItemId: inventoryItems.id,
      inventoryItemOwnerId: inventoryItems.ownerId,
    })
    .from(cartItems)
    .innerJoin(channelListings, eq(cartItems.channelListingId, channelListings.id))
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .where(eq(cartItems.cartId, session.cartId));

  const inventoryItemIds = cartItemRows.map((r) => r.inventoryItemId);

  // AUDIT-003: if cart_items are gone we cannot recover the order. This is
  // unrecoverable (money captured, no recovery fuel). Throw loudly so the
  // webhook returns non-2xx → dead-letters + Stripe retries, and the log line
  // is distinguishable from the normal "no cart items" guard.
  if (cartItemRows.length === 0) {
    // Distinguish recovery (session already succeeded) from the normal path.
    const isRecovery = session.status === "succeeded";
    throw new Error(
      isRecovery
        ? `AUDIT-003 UNRECOVERABLE: session ${session.id} is succeeded with no order AND no cart_items — money captured, no recovery fuel. Operator intervention required.`
        : `No cart items found for session ${session.id}`,
    );
  }

  // ADR-015 Sprint 1b W1: cart.seller_id was dropped. Derive sellerId from the
  // already-joined inventory owner column. Single-seller path only — the
  // checkout guard rejects multi-seller carts at session creation.
  const distinctSellerIds = Array.from(
    new Set(cartItemRows.map((r) => r.inventoryItemOwnerId)),
  );
  if (distinctSellerIds.length !== 1) {
    throw new Error(
      `Session ${session.id} has ${distinctSellerIds.length} sellers in cart — expected 1 (checkout guard bypass?)`,
    );
  }
  const sellerId = distinctSellerIds[0]!;

  let orderId: string;
  let jobsAlreadyEnqueued = false;
  let wonInsert = false;

  await db.transaction(async (tx) => {
    // Snapshot addresses (read-only — safe to compute before the linearising
    // insert; discarded if we lose the insert).
    let shippingAddressSnapshot: Record<string, unknown> | null = null;
    if (session.shippingAddressId) {
      const [buyerAddr] = await tx
        .select()
        .from(addresses)
        .where(eq(addresses.id, session.shippingAddressId));

      if (buyerAddr) {
        shippingAddressSnapshot = {
          line1: buyerAddr.line1,
          line2: buyerAddr.line2 ?? undefined,
          suburb: buyerAddr.suburb,
          state: buyerAddr.state,
          postcode: buyerAddr.postcode,
          country: buyerAddr.country,
        };
      }
    }

    let senderAddressSnapshot: Record<string, unknown> | null = null;
    const [sellerProfile] = await tx
      .select({
        defaultShippingAddressId: sellerProfiles.defaultShippingAddressId,
        stripeAccountId: sellerProfiles.stripeAccountId,
        stripeChargesEnabled: sellerProfiles.stripeChargesEnabled,
      })
      .from(sellerProfiles)
      .where(eq(sellerProfiles.userId, sellerId));

    if (sellerProfile?.defaultShippingAddressId) {
      const [sellerAddr] = await tx
        .select()
        .from(addresses)
        .where(eq(addresses.id, sellerProfile.defaultShippingAddressId));

      if (sellerAddr) {
        senderAddressSnapshot = {
          line1: sellerAddr.line1,
          line2: sellerAddr.line2 ?? undefined,
          suburb: sellerAddr.suburb,
          state: sellerAddr.state,
          postcode: sellerAddr.postcode,
          country: sellerAddr.country,
        };
      }
    }

    // ── LINEARISATION POINT ──────────────────────────────────────────────
    // Insert the order first. onConflictDoNothing on the unique
    // checkout_session_id means only ONE runner ever wins.
    const inserted = await tx
      .insert(orders)
      .values({
        checkoutSessionId: session.id,
        buyerId: session.buyerId,
        sellerId,
        channelId: session.channelId,
        status: "paid",
        subtotalCents: session.subtotalCents,
        shippingCents: session.shippingCents,
        platformFeeCents: session.platformFeeCents,
        buyerProtectionFeeCents: session.buyerProtectionFeeCents,
        sellerProceedsCents: session.sellerProceedsCents,
        totalCents: session.totalCents,
        currency: session.currency,
        shippingAddressSnapshot,
        senderAddressSnapshot,
        stripePaymentIntentId: pi.id,
      })
      .onConflictDoNothing({ target: orders.checkoutSessionId })
      .returning({ id: orders.id, jobsEnqueuedAt: orders.jobsEnqueuedAt });

    if (inserted.length === 0) {
      // Lost the insert — another runner owns this order. Look it up so the
      // caller can short-circuit. Do NOT touch inventory / payout_holds / cart.
      const [existing] = await tx
        .select({ id: orders.id, jobsEnqueuedAt: orders.jobsEnqueuedAt })
        .from(orders)
        .where(eq(orders.checkoutSessionId, session.id));
      orderId = existing!.id;
      jobsAlreadyEnqueued = existing!.jobsEnqueuedAt !== null;
      wonInsert = false;
      return;
    }

    orderId = inserted[0]!.id;
    jobsAlreadyEnqueued = inserted[0]!.jobsEnqueuedAt !== null;
    wonInsert = true;

    // Winner-only side effects below.

    // Mark inventory items as sold + cascade listings.
    // (cascadeLifecycleToListings is a no-op on an already-`sold` item, so even
    // a redundant pass is harmless — but only the insert winner reaches here.)
    for (const itemId of inventoryItemIds) {
      await tx
        .update(inventoryItems)
        .set({
          availabilityStatus: "sold",
          lifecycleState: "sold",
          version: sql`${inventoryItems.version} + 1`,
        })
        .where(eq(inventoryItems.id, itemId));

      await cascadeLifecycleToListings(itemId, "sold", tx);
    }

    // Insert order items
    await tx.insert(orderItems).values(
      cartItemRows.map((item) => ({
        orderId,
        channelListingId: item.channelListingId,
        priceCents: item.priceCents,
        currency: item.currency,
      })),
    );

    // Insert payout_hold (held) — gates the real Stripe transfer.
    if (sellerProfile?.stripeAccountId) {
      await tx.insert(payoutHolds).values({
        orderId,
        sellerStripeAccountId: sellerProfile.stripeAccountId,
        amountCents: session.sellerProceedsCents,
        currency: session.currency,
        status: sellerProfile.stripeChargesEnabled ? "held" : "blocked",
      });
    } else {
      await tx.insert(payoutHolds).values({
        orderId,
        sellerStripeAccountId: "unknown",
        amountCents: session.sellerProceedsCents,
        currency: session.currency,
        status: "blocked",
      });
    }

    // Delete cart_items (R3: zombie cart fix). Only the insert winner does this,
    // so recovery fuel survives for a losing/recovery runner.
    await tx.delete(cartItems).where(eq(cartItems.cartId, session.cartId));
  });

  // If we lost the insert, another runner already did the side effects + events.
  // Short-circuit — no double events, no double jobs.
  if (!wonInsert) {
    console.info(`[webhook] Order for session ${session.id} already created by another runner (${orderId!}) — skipping side effects`);
    return;
  }

  // Dispatch events (winner only)
  dispatchEvent({
    eventName: "order.created",
    category: "order",
    actorId: session.buyerId,
    entityType: "order",
    entityId: orderId!,
    channelId: session.channelId,
    metadata: { checkoutSessionId: session.id },
  }).catch((err) => {
    console.error("[webhook] Failed to dispatch order.created:", err);
  });

  dispatchEvent({
    eventName: "payment.succeeded",
    category: "payment",
    actorId: session.buyerId,
    entityType: "checkout_session",
    entityId: session.id,
    channelId: session.channelId,
    metadata: { paymentIntentId: pi.id, orderId: orderId! },
  }).catch((err) => {
    console.error("[webhook] Failed to dispatch payment.succeeded:", err);
  });

  // Enqueue jobs — only if not already enqueued (AUDIT-010 idempotency guard).
  if (!jobsAlreadyEnqueued) {
    await enqueueOrderJobs(orderId!, session.buyerId, sellerId, session.channelId);
  }
}

// ---------------------------------------------------------------------------
// payment_intent.requires_action handler (3DS / SCA flows)
// ---------------------------------------------------------------------------

async function handlePaymentIntentRequiresAction(pi: Stripe.PaymentIntent): Promise<void> {
  const [session] = await db
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.stripePaymentIntentId, pi.id));

  if (!session) {
    console.warn(`[webhook] No checkout session found for PaymentIntent ${pi.id} (requires_action)`);
    return;
  }

  // Only transition from payment_pending — ignore if already in requires_action or terminal
  if (session.status !== "payment_pending") {
    console.info(`[webhook] Skipping requires_action: session ${session.id} is in status '${session.status}'`);
    return;
  }

  await db
    .update(checkoutSessions)
    .set({
      status: "requires_action",
      version: sql`${checkoutSessions.version} + 1`,
    })
    .where(
      and(
        eq(checkoutSessions.id, session.id),
        eq(checkoutSessions.version, session.version),
        eq(checkoutSessions.status, "payment_pending"),
      ),
    );
}

// ---------------------------------------------------------------------------
// payment_intent.payment_failed handler
// ---------------------------------------------------------------------------

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  // 1. Look up checkout session
  const [session] = await db
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.stripePaymentIntentId, pi.id));

  if (!session) {
    console.warn(`[webhook] No checkout session found for PaymentIntent ${pi.id}`);
    return;
  }

  // Skip if already in a terminal status
  if (!["payment_pending", "requires_action"].includes(session.status)) {
    console.info(`[webhook] Skipping payment_intent.payment_failed: session ${session.id} is in status '${session.status}'`);
    return;
  }

  // 2. Transition → failed (compare-and-set)
  const casResult = await db
    .update(checkoutSessions)
    .set({
      status: "failed",
      version: sql`${checkoutSessions.version} + 1`,
    })
    .where(
      and(
        eq(checkoutSessions.id, session.id),
        eq(checkoutSessions.version, session.version),
        inArray(checkoutSessions.status, ["payment_pending", "requires_action"]),
      ),
    )
    .returning({ id: checkoutSessions.id });

  if (casResult.length === 0) {
    console.warn(`[webhook] CAS failed for session ${session.id} on payment_failed — concurrent transition`);
    return;
  }

  // 3. Release all inventory reservations
  const inventoryItemIds = await getInventoryItemsForCart(session.cartId);
  await releaseItems(inventoryItemIds);

  // 4. Emit inventory.released event → channel-unpause worker
  dispatchEvent({
    eventName: "inventory.released",
    category: "inventory",
    entityType: "checkout_session",
    entityId: session.id,
    channelId: session.channelId,
    metadata: { inventoryItemIds, reason: "payment_failed" },
  }).catch((err) => {
    console.error("[webhook] Failed to dispatch inventory.released:", err);
  });

  // 5. Dispatch payment.failed event
  dispatchEvent({
    eventName: "payment.failed",
    category: "payment",
    actorId: session.buyerId,
    entityType: "checkout_session",
    entityId: session.id,
    channelId: session.channelId,
    metadata: { paymentIntentId: pi.id },
  }).catch((err) => {
    console.error("[webhook] Failed to dispatch payment.failed:", err);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get inventory item IDs for a cart (via cart items → channel listings → inventory).
 */
async function getInventoryItemsForCart(cartId: string): Promise<string[]> {
  const rows = await db
    .select({ inventoryItemId: inventoryItems.id })
    .from(cartItems)
    .innerJoin(channelListings, eq(cartItems.channelListingId, channelListings.id))
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .where(eq(cartItems.cartId, cartId));

  return rows.map((r) => r.inventoryItemId);
}

/**
 * Enqueue order-related jobs (email notifications, shipping label generation).
 * Sets jobs_enqueued_at on the order to prevent duplicate enqueues on webhook retry.
 *
 * AUDIT-010: errors are NOT swallowed. If any enqueue fails, the error
 * propagates so the webhook returns non-2xx → Stripe retries → self-heals.
 * `jobs_enqueued_at` is set only AFTER all three enqueues succeed, so a partial
 * failure leaves the guard null and the retry re-runs the whole set. Re-running
 * is safe: the three jobs use deterministic BullMQ jobIds (`${type}-${orderId}`,
 * `label-${orderId}`) so a duplicate enqueue is deduped, not duplicated. The two
 * `enqueueEmail` calls pass NO `notificationId`, preserving the deterministic
 * jobId.
 */
export async function enqueueOrderJobs(
  orderId: string,
  buyerId: string,
  sellerId: string,
  channelId: string,
): Promise<void> {
  // Enqueue buyer + seller confirmation emails
  await enqueueEmail({ type: "order_confirmation_buyer", orderId });
  await enqueueEmail({ type: "order_notification_seller", orderId });

  // Enqueue shipping label generation
  await enqueueShippingLabel(orderId);

  // Set guard timestamp ONLY after all enqueues succeed.
  await db
    .update(orders)
    .set({ jobsEnqueuedAt: new Date() })
    .where(eq(orders.id, orderId));

  console.info(`[webhook] Jobs enqueued for order ${orderId} (buyer=${buyerId}, seller=${sellerId}, channel=${channelId})`);
}

// ---------------------------------------------------------------------------
// Test-only exports (allow integration tests to call handlers directly)
// ---------------------------------------------------------------------------

/**
 * @internal Test-only: invoke payment_intent.succeeded handler directly.
 *
 * Constructs a minimal PI object. `amount` / `currency` default to the matching
 * checkout session's own values, because a real `payment_intent.succeeded` for
 * that session always carries exactly those — the handler now asserts it. Pass
 * `overrides` to simulate a mismatched charge.
 */
export async function handlePaymentIntentSucceededForTest(
  paymentIntentId: string,
  overrides?: { amount?: number; currency?: string },
): Promise<void> {
  const [session] = await db
    .select({ totalCents: checkoutSessions.totalCents, currency: checkoutSessions.currency })
    .from(checkoutSessions)
    .where(eq(checkoutSessions.stripePaymentIntentId, paymentIntentId));

  await handlePaymentIntentSucceeded({
    id: paymentIntentId,
    amount: overrides?.amount ?? session?.totalCents ?? 0,
    currency: overrides?.currency ?? session?.currency?.toLowerCase() ?? "aud",
  } as Stripe.PaymentIntent);
}

/**
 * @internal Test-only: invoke payment_intent.payment_failed handler directly.
 */
export async function handlePaymentIntentFailedForTest(paymentIntentId: string): Promise<void> {
  await handlePaymentIntentFailed({ id: paymentIntentId } as Stripe.PaymentIntent);
}

/**
 * @internal Test-only: invoke the charge.dispute.created handler directly.
 */
export async function handleChargeDisputeCreatedForTest(dispute: Stripe.Dispute): Promise<void> {
  await handleChargeDisputeCreated(dispute);
}

/**
 * @internal Test-only: invoke the charge.dispute.closed handler directly.
 */
export async function handleChargeDisputeClosedForTest(dispute: Stripe.Dispute): Promise<void> {
  await handleChargeDisputeClosed(dispute);
}
