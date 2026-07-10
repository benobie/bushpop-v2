import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  carts,
  cartItems,
  channelListings,
  inventoryItems,
  checkoutSessions,
  addresses,
  channels,
  user,
} from "@bushpop/db/schema";
import {
  AppError,
  ConflictError,
  GuestEmailAlreadyRegisteredError,
  NotFoundError,
  ValidationError,
} from "../../../../lib/errors.js";
import { assertCheckoutReady } from "../../../../lib/seller-readiness.js";
import { assertSingleSellerCart } from "../../../../lib/cart-sellers.js";
import { reserveItems, releaseItems, getInventoryStatuses } from "../../../../lib/inventory-reservation.js";
import { getStripe } from "../../../../lib/stripe.js";
import { dispatchEvent } from "../../../../lib/events.js";
import { CHECKOUT_ACTIVE_STATUSES } from "../../../../lib/commerce-machines.js";
import { scheduleCheckoutExpiry } from "../../../../workers/checkout-expiry.js";
import { calculateOrderTotals, type OrderTotalsItem } from "../../../../lib/order-totals.js";

// ── Constants ──

const CHECKOUT_EXPIRY_MINUTES = 30;

// ── Types ──

export interface CheckoutTotals {
  subtotalCents: number;
  shippingCents: number;
  platformFeeCents: number;
  buyerProtectionFeeCents: number;
  sellerProceedsCents: number;
  totalCents: number;
  currency: string;
}

export interface CheckoutResult {
  sessionId: string;
  clientSecret: string | null;
  expiresAt: Date | null;
  status: string;
  totals: CheckoutTotals;
}

// ── Helpers ──

/**
 * Calculate totals for a cart — delegates to the shared money-math module
 * (commission from @bushpop/config COMMISSION_SCHEDULE, buyer-side shipping
 * for buyer_pays items only, prepaid label deduction, Buyer Protection fee
 * from Fee Model D). Task 9.
 */
function calculateTotals(
  items: OrderTotalsItem[],
  currency: string,
): CheckoutTotals {
  const totals = calculateOrderTotals(items, currency);
  return {
    subtotalCents: totals.subtotalCents,
    shippingCents: totals.shippingCents,
    platformFeeCents: totals.platformFeeCents,
    buyerProtectionFeeCents: totals.buyerProtectionFeeCents,
    sellerProceedsCents: totals.sellerProceedsCents,
    totalCents: totals.totalCents,
    currency: totals.currency,
  };
}

// ── Public API ──

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; cause?: { code?: unknown } };
  return e.code === "23505" || e.cause?.code === "23505";
}

/**
 * BF-08 guest commerce — overwrite an anonymous buyer's placeholder email
 * with the address they entered at checkout. Scoped to is_anonymous = true
 * so this can never touch a real account's email via the checkout body.
 * Order-confirmation email (workers/email.ts) reads user.email directly, so
 * this must run before initiateCheckout creates the PaymentIntent.
 */
export async function setGuestCheckoutEmail(userId: string, email: string): Promise<void> {
  try {
    const result = await db
      .update(user)
      .set({ email, updatedAt: new Date() })
      .where(and(eq(user.id, userId), eq(user.isAnonymous, true)))
      .returning({ id: user.id });

    if (result.length === 0) {
      throw new ValidationError("Could not set checkout email for this guest session.");
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new GuestEmailAlreadyRegisteredError();
    }
    throw err;
  }
}

/**
 * Initiate checkout for the buyer's current cart.
 *
 * Flow (DB-before-Stripe):
 * 1. Validate cart + items
 * 2. Check for existing active session (reuse if found)
 * 3. Re-validate prices
 * 4. Re-validate listings active
 * 5. assertCheckoutReady(sellerId)
 * 6. Validate buyer's address
 * 7. Calculate totals
 * 8. DB transaction: reserve inventory + insert checkout_session (created)
 * 9. Emit inventory.reserved event (async)
 * 10. Create Stripe PaymentIntent (try/catch — cleanup on failure)
 * 11. Update session with stripe fields
 * 12. Schedule BullMQ expiry job
 * 13. Return result
 */
export async function initiateCheckout(
  buyerId: string,
  channelId: string,
  shippingAddressId: string,
): Promise<CheckoutResult> {
  // 1. Validate cart exists + has items
  const [cart] = await db
    .select()
    .from(carts)
    .where(and(eq(carts.buyerId, buyerId), eq(carts.channelId, channelId)));

  if (!cart) {
    throw new NotFoundError("Cart not found");
  }

  const cartItemRows = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id));

  if (cartItemRows.length === 0) {
    throw new ValidationError("Cart is empty");
  }

  // 2. Check for existing active checkout session → reuse
  const [existingSession] = await db
    .select()
    .from(checkoutSessions)
    .where(
      and(
        eq(checkoutSessions.cartId, cart.id),
        inArray(
          checkoutSessions.status,
          CHECKOUT_ACTIVE_STATUSES as string[],
        ),
      ),
    );

  if (existingSession) {
    return {
      sessionId: existingSession.id,
      clientSecret: existingSession.stripeClientSecret,
      expiresAt: existingSession.expiresAt,
      status: existingSession.status,
      totals: {
        subtotalCents: existingSession.subtotalCents,
        shippingCents: existingSession.shippingCents,
        platformFeeCents: existingSession.platformFeeCents,
        buyerProtectionFeeCents: existingSession.buyerProtectionFeeCents,
        sellerProceedsCents: existingSession.sellerProceedsCents,
        totalCents: existingSession.totalCents,
        currency: existingSession.currency,
      },
    };
  }

  // Fetch full listing + inventory data for validation
  const listingRows = await db
    .select({
      listingId: channelListings.id,
      listingStatus: channelListings.status,
      listingHiddenAt: channelListings.hiddenAt,
      listingPriceCents: channelListings.priceCents,
      inventoryItemId: inventoryItems.id,
      inventoryVersion: inventoryItems.version,
      availabilityStatus: inventoryItems.availabilityStatus,
      shippingClass: inventoryItems.shippingClass,
      shippingOption: inventoryItems.shippingOption,
      parcelSize: inventoryItems.parcelSize,
      ownerId: inventoryItems.ownerId,
    })
    .from(cartItems)
    .innerJoin(channelListings, eq(cartItems.channelListingId, channelListings.id))
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .where(eq(cartItems.cartId, cart.id));

  // 3. Re-validate prices — compare snapshot vs current listing price
  for (const cartItem of cartItemRows) {
    const row = listingRows.find((r) => r.listingId === cartItem.channelListingId);
    if (!row) continue;
    if (cartItem.priceCents !== row.listingPriceCents) {
      throw new ValidationError(
        `Price has changed for listing ${cartItem.channelListingId}. Please remove and re-add the item.`,
      );
    }
  }

  // 4. Re-validate all listings still active and not hidden
  const inactiveListing = listingRows.find((r) => r.listingStatus !== "active");
  if (inactiveListing) {
    throw new ConflictError(
      `Listing ${inactiveListing.listingId} is no longer available (status: ${inactiveListing.listingStatus})`,
    );
  }

  const hiddenListing = listingRows.find((r) => r.listingHiddenAt !== null);
  if (hiddenListing) {
    throw new ConflictError(
      `Listing ${hiddenListing.listingId} is no longer available`,
    );
  }

  // 5. assertCheckoutReady(sellerId) — ADR-015 Sprint 1b W1: cart may hold items
  // from multiple sellers, but the current checkout path (checkout_sessions +
  // destination charges) only supports single-seller. assertSingleSellerCart
  // rejects a multi-seller cart with 422 MULTI_SELLER_CHECKOUT_UNSUPPORTED.
  // W2 replaces this with the order_groups quote flow.
  const sellerId = await assertSingleSellerCart(cart.id);
  await assertCheckoutReady(sellerId);

  // 6. Validate buyer's address
  const [buyerAddress] = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.id, shippingAddressId), eq(addresses.userId, buyerId), isNull(addresses.deletedAt)));

  if (!buyerAddress) {
    throw new ValidationError("Shipping address not found or does not belong to you");
  }

  // 7. Calculate totals
  const [channelRow] = await db
    .select({ currency: channels.currency })
    .from(channels)
    .where(eq(channels.id, channelId));

  const currency = channelRow?.currency ?? "AUD";

  const itemsForCalc = listingRows.map((r) => ({
    priceCents: r.listingPriceCents,
    shippingClass: r.shippingClass,
    shippingOption: r.shippingOption,
    parcelSize: r.parcelSize,
  }));
  const totals = calculateTotals(itemsForCalc, currency);
  if (totals.sellerProceedsCents < 0) {
    // Prepaid label costs exceed the seller's take — unsettleable order.
    throw new ValidationError(
      "An item's price does not cover its shipping label costs. The seller needs to raise the price or change the shipping option.",
    );
  }

  const expiresAt = new Date(Date.now() + CHECKOUT_EXPIRY_MINUTES * 60 * 1_000);

  // Prepare reservation targets
  const reservationTargets = listingRows.map((r) => ({
    inventoryItemId: r.inventoryItemId,
    version: r.inventoryVersion,
  }));

  // 8+9. DB transaction: reserve inventory + insert checkout_session
  let sessionId: string;

  await db.transaction(async (tx) => {
    // Reserve inventory (throws ConflictError on version mismatch)
    await reserveItems(reservationTargets, tx);

    // Insert checkout_session in 'created' status
    const [session] = await tx
      .insert(checkoutSessions)
      .values({
        cartId: cart.id,
        buyerId,
        channelId,
        status: "created",
        version: 1,
        subtotalCents: totals.subtotalCents,
        shippingCents: totals.shippingCents,
        platformFeeCents: totals.platformFeeCents,
        buyerProtectionFeeCents: totals.buyerProtectionFeeCents,
        sellerProceedsCents: totals.sellerProceedsCents,
        totalCents: totals.totalCents,
        currency: totals.currency,
        shippingAddressId,
        expiresAt,
      })
      .returning({ id: checkoutSessions.id });

    sessionId = session!.id;
  });

  const inventoryItemIds = reservationTargets.map((r) => r.inventoryItemId);

  // 10. Emit inventory.reserved event (async, best-effort)
  dispatchEvent({
    eventName: "inventory.reserved",
    category: "inventory",
    actorId: buyerId,
    entityType: "checkout_session",
    entityId: sessionId!,
    channelId,
    metadata: { inventoryItemIds },
  }).catch((err) => {
    console.error("[checkout] Failed to dispatch inventory.reserved:", err);
  });

  // 11. Create Stripe PaymentIntent (try/catch — cleanup on failure)
  const stripe = getStripe();
  let stripePaymentIntentId: string;
  let stripeClientSecret: string;

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totals.totalCents,
        currency: totals.currency.toLowerCase(),
        transfer_group: sessionId!,
        // W4 decision: card + Apple/Google Pay only (both ride on the
        // "card" payment method type). Explicitly excludes Link, which
        // Stripe otherwise enables by account default and renders its
        // inline capture UI for it even though Link is unverified for
        // production.
        payment_method_types: ["card"],
        metadata: {
          checkoutSessionId: sessionId!,
          buyerId,
          sellerId,
          channelId,
        },
      },
      {
        idempotencyKey: sessionId!,
      },
    );

    if (!paymentIntent.client_secret) {
      throw new Error("Stripe PaymentIntent missing client_secret");
    }

    stripePaymentIntentId = paymentIntent.id;
    stripeClientSecret = paymentIntent.client_secret;
  } catch (stripeErr) {
    // Cleanup: update session to failed + release reservations
    await db
      .update(checkoutSessions)
      .set({ status: "failed" })
      .where(eq(checkoutSessions.id, sessionId!));

    await releaseItems(inventoryItemIds);

    console.error("[checkout] Stripe PaymentIntent creation failed:", stripeErr);
    throw new AppError("Payment initialisation failed. Please try again.", 502, "STRIPE_ERROR");
  }

  // 12. CAS transition: created → payment_pending + store Stripe fields
  try {
    const casResult = await db
      .update(checkoutSessions)
      .set({
        stripePaymentIntentId,
        stripeClientSecret,
        status: "payment_pending",
        version: sql`${checkoutSessions.version} + 1`,
      })
      .where(
        and(
          eq(checkoutSessions.id, sessionId!),
          eq(checkoutSessions.status, "created"),
        ),
      )
      .returning({ id: checkoutSessions.id });

    if (casResult.length === 0) {
      // Session was concurrently modified (e.g. expired) — cancel PI + release
      await stripe.paymentIntents.cancel(stripePaymentIntentId).catch((e) => {
        console.error("[checkout] Failed to cancel PaymentIntent after CAS failure:", e);
      });
      await releaseItems(inventoryItemIds);
      throw new ConflictError("Checkout session was modified concurrently. Please try again.");
    }
  } catch (dbErr) {
    if (dbErr instanceof ConflictError) throw dbErr;
    // DB update failed after Stripe succeeded — cancel PaymentIntent + release
    await stripe.paymentIntents.cancel(stripePaymentIntentId).catch((e) => {
      console.error("[checkout] Failed to cancel PaymentIntent after DB error:", e);
    });

    await releaseItems(inventoryItemIds);

    throw new AppError("Checkout initialisation failed. Please try again.", 500, "CHECKOUT_INIT_FAILED");
  }

  // 13. Schedule BullMQ expiry job
  scheduleCheckoutExpiry(sessionId!, expiresAt, inventoryItemIds, stripePaymentIntentId).catch(
    (err) => {
      console.error("[checkout] Failed to schedule expiry job:", err);
    },
  );

  return {
    sessionId: sessionId!,
    clientSecret: stripeClientSecret,
    expiresAt,
    status: "payment_pending",
    totals,
  };
}

/**
 * Get a checkout session by ID (buyer ownership verified).
 */
export async function getCheckoutSession(
  sessionId: string,
  buyerId: string,
): Promise<typeof checkoutSessions.$inferSelect> {
  const [session] = await db
    .select()
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.id, sessionId), eq(checkoutSessions.buyerId, buyerId)));

  if (!session) {
    throw new NotFoundError("Checkout session not found");
  }

  return session;
}

/**
 * Cancel a checkout session.
 *
 * Allowed from 'created' and 'payment_pending' only (NOT requires_action).
 * - Transitions session → abandoned (compare-and-set)
 * - Releases inventory reservations
 * - Cancels PaymentIntent (if present)
 * - Emits inventory.released event
 */
export async function cancelCheckoutSession(
  sessionId: string,
  buyerId: string,
): Promise<void> {
  const session = await getCheckoutSession(sessionId, buyerId);

  // Only allow cancel from created or payment_pending (not requires_action)
  if (!["created", "payment_pending"].includes(session.status)) {
    throw new ValidationError(
      `Cannot cancel checkout session in status '${session.status}'. ` +
        "Cancellation is only allowed from 'created' or 'payment_pending'.",
    );
  }

  // Compare-and-set: transition to abandoned
  const result = await db
    .update(checkoutSessions)
    .set({
      status: "abandoned",
      version: sql`${checkoutSessions.version} + 1`,
    })
    .where(
      and(
        eq(checkoutSessions.id, sessionId),
        eq(checkoutSessions.version, session.version),
        inArray(checkoutSessions.status, ["created", "payment_pending"] as string[]),
      ),
    )
    .returning({ id: checkoutSessions.id });

  if (result.length === 0) {
    throw new ConflictError("Checkout session was modified concurrently. Please refresh and try again.");
  }

  // Fetch inventory items for this cart's checkout session
  const inventoryItemIds = await getInventoryItemsForSession(sessionId, session.cartId);

  // Release inventory reservations
  await releaseItems(inventoryItemIds);

  // Cancel Stripe PaymentIntent if present
  if (session.stripePaymentIntentId) {
    const stripe = getStripe();
    await stripe.paymentIntents.cancel(session.stripePaymentIntentId).catch((err) => {
      console.error("[checkout] Failed to cancel PaymentIntent on session cancel:", err);
    });
  }

  // Emit inventory.released event (async, best-effort)
  dispatchEvent({
    eventName: "inventory.released",
    category: "inventory",
    actorId: buyerId,
    entityType: "checkout_session",
    entityId: sessionId,
    channelId: session.channelId,
    metadata: { inventoryItemIds, reason: "buyer_cancelled" },
  }).catch((err) => {
    console.error("[checkout] Failed to dispatch inventory.released:", err);
  });
}

/**
 * Expire a checkout session (called by BullMQ expiry worker).
 *
 * - Compare-and-set: transition to expired
 * - Releases inventory reservations
 * - Cancels PaymentIntent
 * - Emits inventory.released
 *
 * Returns false if the session was already handled (0 rows updated = noop).
 */
export async function expireCheckoutSession(
  sessionId: string,
): Promise<boolean> {
  const [session] = await db
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.id, sessionId));

  if (!session) return false;

  // Must be in an active status to expire
  if (!(CHECKOUT_ACTIVE_STATUSES as readonly string[]).includes(session.status)) {
    return false; // Already terminal
  }

  // Compare-and-set: transition to expired
  const result = await db
    .update(checkoutSessions)
    .set({
      status: "expired",
      version: sql`${checkoutSessions.version} + 1`,
    })
    .where(
      and(
        eq(checkoutSessions.id, sessionId),
        eq(checkoutSessions.version, session.version),
        inArray(checkoutSessions.status, CHECKOUT_ACTIVE_STATUSES as string[]),
      ),
    )
    .returning({ id: checkoutSessions.id });

  if (result.length === 0) {
    return false; // Concurrent transition won
  }

  const inventoryItemIds = await getInventoryItemsForSession(sessionId, session.cartId);

  // Release inventory
  await releaseItems(inventoryItemIds);

  // Cancel PaymentIntent
  if (session.stripePaymentIntentId) {
    const stripe = getStripe();
    await stripe.paymentIntents.cancel(session.stripePaymentIntentId).catch((err) => {
      console.error("[checkout] Failed to cancel PaymentIntent on expiry:", err);
    });
  }

  // Emit inventory.released
  dispatchEvent({
    eventName: "inventory.released",
    category: "inventory",
    entityType: "checkout_session",
    entityId: sessionId,
    channelId: session.channelId,
    metadata: { inventoryItemIds, reason: "session_expired" },
  }).catch((err) => {
    console.error("[checkout] Failed to dispatch inventory.released on expiry:", err);
  });

  return true;
}

/**
 * Compensation handler for payment_intent.succeeded on an expired session.
 *
 * Attempts re-reservation. If all items are available, marks session for order
 * creation. If any item is sold/reserved, triggers auto-refund.
 */
export async function handlePaymentAfterExpiry(
  sessionId: string,
  paymentIntentId: string,
): Promise<"reactivated" | "refunded"> {
  const [session] = await db
    .select()
    .from(checkoutSessions)
    .where(and(eq(checkoutSessions.id, sessionId), eq(checkoutSessions.stripePaymentIntentId, paymentIntentId)));

  if (!session || session.status !== "expired") {
    throw new Error(`Session ${sessionId} is not in expired status`);
  }

  const inventoryItemIds = await getInventoryItemsForSession(sessionId, session.cartId);
  const statuses = await getInventoryStatuses(inventoryItemIds);
  const allAvailable = statuses.every((s) => s.availabilityStatus === "available");

  if (allAvailable) {
    // Attempt re-reservation
    const targets = statuses.map((s) => ({ inventoryItemId: s.id, version: s.version }));
    try {
      await reserveItems(targets);
      // Mark session so webhook can create order (reactivate to payment_pending or custom state)
      // For now, log and return — order creation is webhook-side
      console.info(`[checkout] Re-reservation succeeded for expired session ${sessionId}`);
      return "reactivated";
    } catch {
      // Fall through to refund
    }
  }

  // Auto-refund
  //
  // LB-F7-REFUND-FLAGS (GPT-Council phase-4-checkout-slice R1 post-research,
  // research-285 verified): `stripe.refunds.create` defaults both
  // `reverse_transfer` and `refund_application_fee` to `false`. NOTE: this
  // direct-mode checkout path never sets `transfer_data.destination` on its
  // own PaymentIntent (see the plain `stripe.paymentIntents.create` call
  // above) — only the separate checkout-groups path conditionally uses
  // Stripe Connect destination charges (single-seller `chargeType:
  // "destination"`). The dynamic per-charge check below is a defensive
  // guardrail, not evidence this path uses destination charges today; if it
  // ever does, getting either flag wrong means the buyer is refunded from
  // the platform's balance but the seller keeps the transferred funds AND
  // Piklo keeps the application fee as a stranded liability — the platform
  // account eats the full refund as negative balance. This is a silent
  // money-leak that would fire on every late-success recovery.
  //
  // Guardrail: the two flags are independent and gated on different conditions.
  // `reverse_transfer` is needed whenever `transfer_data.destination` is set,
  // EVEN IF the application fee is zero (seller still got the transfer). Only
  // `refund_application_fee` depends on a non-zero fee — otherwise Stripe
  // errors with `application_fee_not_found`. Non-Connect charges skip both.
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  const latestChargeId =
    typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;

  let hasDestinationTransfer = false;
  let hasApplicationFee = false;
  if (latestChargeId) {
    const charge = await stripe.charges.retrieve(latestChargeId);
    hasDestinationTransfer = charge.transfer_data?.destination != null;
    hasApplicationFee = (charge.application_fee_amount ?? 0) > 0;
  }

  await stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      reason: "requested_by_customer",
      // WP-0: pin the refund amount. This path runs before any order row exists,
      // so there's no order.totalCents to reuse — the checkout session's own
      // locked-at-creation total is the equivalent value (see refund-service.ts
      // for the shared-group-PI rationale this guards against).
      amount: session.totalCents,
      metadata: {
        piklo_reason: "late_success_recovery",
        checkout_session_id: sessionId,
      },
      ...(hasDestinationTransfer && { reverse_transfer: true }),
      ...(hasApplicationFee && { refund_application_fee: true }),
    },
    // Keyed on the session, which is the unit being recovered here (no refund
    // row and no order row exist on this path). Two concurrent or retried
    // recoveries of the same expired session therefore refund the buyer once,
    // matching the `refund_${refundId}` keying in refund-service.ts. The
    // session's terminal `refunded_after_expiry` status below is not a
    // sufficient guard on its own — it is written after the money moves.
    { idempotencyKey: `late_success_refund_${sessionId}` },
  );

  await db
    .update(checkoutSessions)
    .set({ status: "refunded_after_expiry", version: sql`${checkoutSessions.version} + 1` })
    .where(eq(checkoutSessions.id, sessionId));

  console.warn(
    `[checkout] Auto-refunded payment after expiry for session ${sessionId} ` +
      `(reverse_transfer=${hasDestinationTransfer} refund_application_fee=${hasApplicationFee})`,
  );

  return "refunded";
}

// ── Private helpers ──

/**
 * Fetches inventory item IDs for a checkout session via its cart items.
 */
async function getInventoryItemsForSession(
  _sessionId: string,
  cartId: string,
): Promise<string[]> {
  const rows = await db
    .select({ inventoryItemId: inventoryItems.id })
    .from(cartItems)
    .innerJoin(channelListings, eq(cartItems.channelListingId, channelListings.id))
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .where(eq(cartItems.cartId, cartId));

  return rows.map((r) => r.inventoryItemId);
}
