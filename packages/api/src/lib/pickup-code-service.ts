import crypto from "node:crypto";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { orders, payoutHolds, pickupCodes } from "@bushpop/db/schema";
import { NotFoundError, ConflictError, ValidationError } from "./errors.js";
import { dispatchEvent } from "./events.js";
import { releasePayoutHold } from "./payout-hold-service.js";

const CODE_LENGTH = 6;
export const MAX_PICKUP_CODE_ATTEMPTS = 5;

function getPickupCodeSecret(): string {
  const secret = process.env.PICKUP_CODE_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PICKUP_CODE_SECRET must be set in production.");
  }
  // Dev/test only — never reachable in production (guard above).
  return "dev-only-pickup-code-secret-do-not-use-in-prod";
}

/**
 * Deterministically derives the 6-digit collection code from orderId + the
 * row's per-order salt. Nothing about the code is ever persisted — it's
 * recomputed on every read/redemption, so it stays "always visible" to the
 * buyer without a reversible ciphertext or plaintext column.
 */
function deriveCode(orderId: string, salt: string): string {
  const hmac = crypto.createHmac("sha256", getPickupCodeSecret());
  hmac.update(`${orderId}:${salt}`);
  const num = hmac.digest().readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(CODE_LENGTH, "0");
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Pickup orders are the only orders with all three signals:
 * - no shipping-address snapshot,
 * - no shipping charge,
 * - no buyer-protection fee.
 *
 * Relying on the null snapshot alone is unsafe: a posted order can still end
 * up with a missing snapshot if upstream order creation ever loses the address
 * row, which would wrongly unlock the instant-complete / instant-payout path.
 */
export function isPickupOrder(order: {
  shippingAddressSnapshot: unknown;
  shippingCents: number;
  buyerProtectionFeeCents: number;
}): boolean {
  return (
    order.shippingAddressSnapshot === null &&
    order.shippingCents === 0 &&
    order.buyerProtectionFeeCents === 0
  );
}

async function getOrCreatePickupCodeRow(orderId: string) {
  const [existing] = await db
    .select()
    .from(pickupCodes)
    .where(eq(pickupCodes.orderId, orderId))
    .limit(1);
  if (existing) return existing;

  const salt = crypto.randomBytes(16).toString("hex");
  const [inserted] = await db
    .insert(pickupCodes)
    .values({ orderId, salt })
    .onConflictDoNothing({ target: pickupCodes.orderId })
    .returning();
  if (inserted) return inserted;

  // Lost the insert race to a concurrent request — read the winner's row.
  const [row] = await db
    .select()
    .from(pickupCodes)
    .where(eq(pickupCodes.orderId, orderId))
    .limit(1);
  if (!row) {
    throw new Error(`Failed to issue or read pickup code for order ${orderId}`);
  }
  return row;
}

/**
 * Issue (or re-fetch) the buyer's pickup collection code. Idempotent —
 * repeated calls before redemption always return the same code.
 */
export async function issuePickupCodeForBuyer(orderId: string, buyerId: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.buyerId, buyerId)))
    .limit(1);

  if (!order) {
    throw new NotFoundError("Order not found");
  }
  if (!isPickupOrder(order)) {
    throw new ValidationError("This order is not a pickup order.");
  }
  if (order.status !== "paid") {
    throw new ConflictError(
      `Cannot show a collection code for an order in status '${order.status}'.`,
    );
  }

  const row = await getOrCreatePickupCodeRow(orderId);
  if (row.redeemedAt) {
    throw new ConflictError("This order has already been collected.");
  }

  return {
    orderId,
    code: deriveCode(orderId, row.salt),
    issuedAt: row.issuedAt.toISOString(),
  };
}

/**
 * Seller redeems the buyer's collection code at handover. Per D3
 * (docs/BRIEF-shipping-performance.md §4) this IS the pickup delivery event —
 * there is no separate buyer-confirm step, and escrow releases instantly.
 */
export async function redeemPickupCode(
  orderId: string,
  sellerId: string,
  submittedCode: string,
) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.sellerId, sellerId)))
    .limit(1);

  if (!order) {
    throw new NotFoundError("Order not found");
  }
  if (!isPickupOrder(order)) {
    throw new ValidationError("This order is not a pickup order.");
  }
  if (order.status !== "paid") {
    throw new ConflictError(
      `Cannot confirm pickup for an order in status '${order.status}'. Order must be in 'paid' status.`,
    );
  }

  const row = await getOrCreatePickupCodeRow(orderId);
  if (row.redeemedAt) {
    throw new ConflictError("This order has already been collected.");
  }
  if (row.attempts >= MAX_PICKUP_CODE_ATTEMPTS) {
    throw new ConflictError(
      "Too many incorrect attempts. Ask the buyer to check their order page, or contact support.",
    );
  }

  const expected = deriveCode(orderId, row.salt);
  const matches =
    submittedCode.length === CODE_LENGTH && timingSafeEqualStrings(submittedCode, expected);

  if (!matches) {
    const [attemptUpdate] = await db
      .update(pickupCodes)
      .set({ attempts: sql`${pickupCodes.attempts} + 1` })
      .where(
        and(
          eq(pickupCodes.id, row.id),
          isNull(pickupCodes.redeemedAt),
          lt(pickupCodes.attempts, MAX_PICKUP_CODE_ATTEMPTS),
        ),
      )
      .returning({ attempts: pickupCodes.attempts });

    if (!attemptUpdate) {
      const [freshRow] = await db
        .select({ attempts: pickupCodes.attempts, redeemedAt: pickupCodes.redeemedAt })
        .from(pickupCodes)
        .where(eq(pickupCodes.id, row.id))
        .limit(1);

      if (freshRow?.redeemedAt) {
        throw new ConflictError("This order has already been collected.");
      }
      if ((freshRow?.attempts ?? MAX_PICKUP_CODE_ATTEMPTS) >= MAX_PICKUP_CODE_ATTEMPTS) {
        throw new ConflictError(
          "Too many incorrect attempts. Ask the buyer to check their order page, or contact support.",
        );
      }
    }

    throw new ConflictError("Incorrect collection code.");
  }

  const now = new Date();
  let holdId: string | null = null;

  await db.transaction(async (tx) => {
    // CAS paid → completed. See commerce-machines.ts for why pickup skips
    // shipped/delivered entirely.
    const orderResult = await tx
      .update(orders)
      .set({ status: "completed", deliveryConfirmedAt: now })
      .where(and(eq(orders.id, orderId), eq(orders.status, "paid")))
      .returning({ id: orders.id });

    if (orderResult.length === 0) {
      throw new ConflictError("Order was modified concurrently. Please refresh and try again.");
    }

    const redeemedResult = await tx
      .update(pickupCodes)
      .set({ redeemedAt: now })
      .where(and(eq(pickupCodes.id, row.id), isNull(pickupCodes.redeemedAt)))
      .returning({ id: pickupCodes.id });

    if (redeemedResult.length === 0) {
      throw new ConflictError("This order has already been collected.");
    }

    const [hold] = await tx
      .select({ id: payoutHolds.id })
      .from(payoutHolds)
      .where(eq(payoutHolds.orderId, orderId))
      .limit(1);

    if (hold) {
      holdId = hold.id;
      await tx
        .update(payoutHolds)
        .set({ buyerConfirmedAt: now, deliveryConfirmedAt: now })
        .where(eq(payoutHolds.id, hold.id));
    }
  });

  dispatchEvent({
    eventName: "order.pickup_code_redeemed",
    category: "order",
    actorId: sellerId,
    entityType: "order",
    entityId: orderId,
    channelId: order.channelId,
    metadata: {},
  }).catch((err) => {
    console.error("[pickup-code] Failed to dispatch order.pickup_code_redeemed:", err);
  });

  // D3: instant escrow release. Setting buyerConfirmedAt lands this hold on
  // evaluateHoldPolicy's tier-1 "buyer_confirmed" policy for any future
  // re-evaluation; releasePayoutHold is the same money-safe core the admin
  // release route uses, called directly (not via the gated sweep worker)
  // because this action IS the instant-release trigger, not a background sweep.
  if (holdId) {
    try {
      const outcome = await releasePayoutHold(holdId, "system");
      if (outcome.result !== "released" && outcome.result !== "adopted") {
        console.error(
          "[pickup-code] releasePayoutHold did not release immediately after pickup redemption:",
          outcome,
        );
      }
    } catch (err) {
      console.error(
        "[pickup-code] releasePayoutHold failed after pickup redemption (will be picked up by the next sweep if enabled):",
        err,
      );
    }
  }

  return { orderId, status: "completed" as const, redeemedAt: now.toISOString() };
}
