import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { db } from "@bushpop/db/client";
import {
  carts,
  cartItems,
  channelListings,
  inventoryItems,
  orderGroups,
  orderGroupSellerAllocations,
  orderGroupAllocationItems,
  addresses,
  channels,
  sellerProfiles,
} from "@bushpop/db/schema";
import { calculateOrderTotals, type OrderTotalsItem } from "../../../../lib/order-totals.js";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../../lib/errors.js";
import { assertCheckoutReady } from "../../../../lib/seller-readiness.js";
import {
  reserveItems,
  releaseItems,
} from "../../../../lib/inventory-reservation.js";
import {
  createPaymentOp,
  succeedPaymentOp,
  failPaymentOp,
  markIndeterminate5xx,
} from "../../../../lib/payment-operations.js";
import { getStripe } from "../../../../lib/stripe.js";
import { ORDER_GROUP_ACTIVE_STATUSES } from "../../../../lib/commerce-machines.js";
import type {
  AllocationSummary,
  CheckoutGroupTotals,
  CheckoutGroupQuoteResponse,
  CheckoutGroupStatusResponse,
} from "@bushpop/types";

// ── Constants ──

const ORDER_GROUP_EXPIRY_MINUTES = 30;

// ── Internal types ──

interface SellerGroupData {
  sellerId: string;
  stripeAccountId: string;
  items: Array<{
    channelListingId: string;
    inventoryItemId: string;
    inventoryVersion: number;
    priceCents: number;
    shippingClass: string | null;
    shippingOption: string | null;
    parcelSize: string | null;
  }>;
}

// ── Helpers ──

/**
 * Compute a deterministic quoteHash for a set of seller allocations.
 *
 * Sort allocations by sellerId ASC, then itemIds ASC within each allocation.
 * SHA-256 of the canonical JSON string.
 */
function computeQuoteHash(
  allocations: Array<{ sellerId: string; subtotalCents: number; itemIds: string[] }>,
): string {
  const sorted = [...allocations].sort((a, b) => a.sellerId.localeCompare(b.sellerId));
  const canonical = sorted.map((a) => ({
    sellerId: a.sellerId,
    subtotalCents: a.subtotalCents,
    itemIds: [...a.itemIds].sort(),
  }));
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * Compute totals for one seller's items — shared money-math module (task 9):
 * commission from @bushpop/config (30c fixed applies once per seller order),
 * buyer-side shipping for buyer_pays items, prepaid label deduction.
 *
 * Fee Model D divergence (task 8ecbbbcf, deliberately NOT fixed here — this
 * multi-seller quote path predates Model D and is out of scope, Phase 2):
 * `calculateOrderTotals`'s `totalCents` now includes the Buyer Protection
 * fee, computed once per call. This function calls it PER SELLER GROUP, so
 * using `totals.totalCents` as-is would (a) charge the 50c flat component
 * once per seller instead of once per order (the same pre-existing pattern
 * the 30c commission fixed component already has here) and (b) inflate
 * `application_fee_amount` on the destination-charge path below, which
 * derives from `totalCents - sellerProceedsCents` — silently over-
 * withholding from the seller's Stripe transfer by the BP fee amount. Both
 * would be real money bugs if this path were wired for live traffic today.
 * Recomputing `totalCents` locally (subtotal + shipping, no BP fee) keeps
 * this path's pre-existing invariants intact: it simply does not charge
 * Buyer Protection yet. Direct-mode checkout (checkout/service.ts) is the
 * only live path and is fully Model D-compliant.
 */
function computeSellerTotals(
  items: OrderTotalsItem[],
  currency: string,
): {
  subtotalCents: number;
  shippingCents: number;
  platformFeeCents: number;
  sellerProceedsCents: number;
  totalCents: number;
  currency: string;
} {
  const totals = calculateOrderTotals(items, currency);
  return {
    subtotalCents: totals.subtotalCents,
    shippingCents: totals.shippingCents,
    platformFeeCents: totals.platformFeeCents,
    sellerProceedsCents: totals.sellerProceedsCents,
    totalCents: totals.subtotalCents + totals.shippingCents,
    currency: totals.currency,
  };
}

// ── Public API ──

/**
 * Create a checkout group quote + Stripe PaymentIntent.
 *
 * Flow:
 * 1.  Load cart + validate non-empty.
 * 2.  Check no active order_group for this cart.
 * 3.  Derive per-item seller grouping (via channel_listings → inventory_items).
 * 4.  Validate buyer address.
 * 5.  Load channel (platformFeeBps, currency).
 * 6.  Load seller Stripe accounts; validate ALL sellers checkout-ready.
 * 7.  Per-seller: compute subtotals, shipping, platform fees.
 * 8.  Compute quoteHash (deterministic).
 * 9.  DB transaction: reserveItems + insert order_group + N allocations + N×items.
 * 10. LB-F8-WAL: createPaymentOp(orderId=null, ...) BEFORE Stripe call.
 * 11. Stripe PaymentIntent (destination or SC&T).
 * 12. On success: succeedPaymentOp + CAS order_group → payment_pending.
 * 13. On Stripe 5xx: markIndeterminate5xx + hasPendingReconciliation=true. Re-throw.
 * 14. On Stripe 4xx: failPaymentOp + CAS → expired + releaseItems. Re-throw.
 * 15. Return quote response.
 */
export async function createQuoteAndPaymentIntent(
  buyerId: string,
  channelId: string,
  shippingAddressId: string,
): Promise<CheckoutGroupQuoteResponse> {
  // 1. Load cart
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

  // 2. Check for existing active order_group on this cart
  const [existingGroup] = await db
    .select({ id: orderGroups.id, status: orderGroups.status })
    .from(orderGroups)
    .where(
      and(
        eq(orderGroups.cartId, cart.id),
        inArray(orderGroups.status, ORDER_GROUP_ACTIVE_STATUSES as string[]),
      ),
    );

  if (existingGroup) {
    throw new ConflictError(
      `An active checkout group already exists for this cart (${existingGroup.id}, status: ${existingGroup.status}). Cancel it before creating a new one.`,
    );
  }

  // 3. Derive per-item seller grouping
  const listingRows = await db
    .select({
      channelListingId: channelListings.id,
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

  // Validate listings active + not hidden
  const inactiveListing = listingRows.find((r) => r.listingStatus !== "active");
  if (inactiveListing) {
    throw new ConflictError(
      `Listing ${inactiveListing.channelListingId} is no longer available (status: ${inactiveListing.listingStatus})`,
    );
  }
  const hiddenListing = listingRows.find((r) => r.listingHiddenAt !== null);
  if (hiddenListing) {
    throw new ConflictError(
      `Listing ${hiddenListing.channelListingId} is no longer available`,
    );
  }

  // Validate prices match cart snapshot
  for (const cartItem of cartItemRows) {
    const row = listingRows.find((r) => r.channelListingId === cartItem.channelListingId);
    if (!row) continue;
    if (cartItem.priceCents !== row.listingPriceCents) {
      throw new ValidationError(
        `Price has changed for listing ${cartItem.channelListingId}. Please remove and re-add the item.`,
      );
    }
  }

  // Group items by seller
  const sellerMap = new Map<string, SellerGroupData>();
  for (const row of listingRows) {
    const entry = sellerMap.get(row.ownerId);
    if (entry) {
      entry.items.push({
        channelListingId: row.channelListingId,
        inventoryItemId: row.inventoryItemId,
        inventoryVersion: row.inventoryVersion,
        priceCents: row.listingPriceCents,
        shippingClass: row.shippingClass,
        shippingOption: row.shippingOption,
        parcelSize: row.parcelSize,
      });
    } else {
      sellerMap.set(row.ownerId, {
        sellerId: row.ownerId,
        stripeAccountId: "", // filled in step 6
        items: [
          {
            channelListingId: row.channelListingId,
            inventoryItemId: row.inventoryItemId,
            inventoryVersion: row.inventoryVersion,
            priceCents: row.listingPriceCents,
            shippingClass: row.shippingClass,
            shippingOption: row.shippingOption,
            parcelSize: row.parcelSize,
          },
        ],
      });
    }
  }

  const sellerIds = [...sellerMap.keys()];
  const chargeType = sellerIds.length === 1 ? "destination" : "sct";

  // 4. Validate buyer address
  const [buyerAddress] = await db
    .select()
    .from(addresses)
    .where(
      and(
        eq(addresses.id, shippingAddressId),
        eq(addresses.userId, buyerId),
        isNull(addresses.deletedAt),
      ),
    );

  if (!buyerAddress) {
    throw new ValidationError("Shipping address not found or does not belong to you");
  }

  // 5. Load channel config
  const [channelRow] = await db
    .select({ currency: channels.currency })
    .from(channels)
    .where(eq(channels.id, channelId));

  const currency = channelRow?.currency ?? "AUD";

  // 6. Load seller Stripe accounts + assert ALL sellers checkout-ready
  // Collect failures before throwing — fail-all strategy for multi-seller
  const sellerProfileRows = await db
    .select({ userId: sellerProfiles.userId, stripeAccountId: sellerProfiles.stripeAccountId })
    .from(sellerProfiles)
    .where(inArray(sellerProfiles.userId, sellerIds));

  const sellerProfileMap = new Map(sellerProfileRows.map((r) => [r.userId, r.stripeAccountId]));

  // assertCheckoutReady throws on first failure (fail-fast per-seller readiness)
  for (const sellerId of sellerIds) {
    await assertCheckoutReady(sellerId);

    const stripeAccountId = sellerProfileMap.get(sellerId);
    if (!stripeAccountId) {
      throw new ValidationError(
        `Seller ${sellerId} does not have a Stripe account connected`,
      );
    }
    const sellerData = sellerMap.get(sellerId)!;
    sellerData.stripeAccountId = stripeAccountId;
  }

  // 7. Compute per-seller totals
  const sellerTotals = new Map<
    string,
    ReturnType<typeof computeSellerTotals>
  >();
  for (const [sellerId, sellerData] of sellerMap) {
    const totals = computeSellerTotals(sellerData.items, currency);
    if (totals.sellerProceedsCents < 0) {
      // Prepaid label costs exceed the seller's take — unsettleable order.
      throw new ValidationError(
        "An item's price does not cover its shipping label costs. The seller needs to raise the price or change the shipping option.",
      );
    }
    sellerTotals.set(sellerId, totals);
  }

  // Group-level totals
  let groupSubtotal = 0;
  let groupShipping = 0;
  let groupPlatformFee = 0;
  let groupSellerProceeds = 0;
  for (const t of sellerTotals.values()) {
    groupSubtotal += t.subtotalCents;
    groupShipping += t.shippingCents;
    groupPlatformFee += t.platformFeeCents;
    groupSellerProceeds += t.sellerProceedsCents;
  }
  const groupTotal = groupSubtotal + groupShipping;

  // 8. Compute quoteHash
  const allocationInputs = sellerIds.map((sellerId) => ({
    sellerId,
    subtotalCents: sellerTotals.get(sellerId)!.subtotalCents,
    itemIds: sellerMap.get(sellerId)!.items.map((i) => i.channelListingId),
  }));
  const quoteHash = computeQuoteHash(allocationInputs);

  const expiresAt = new Date(Date.now() + ORDER_GROUP_EXPIRY_MINUTES * 60_000);

  // Reservation targets across all sellers
  const reservationTargets = listingRows.map((r) => ({
    inventoryItemId: r.inventoryItemId,
    version: r.inventoryVersion,
  }));

  // 9. DB transaction: reserveItems + insert order_group + allocations + items
  let orderGroupId!: string;
  const allocationIds = new Map<string, string>(); // sellerId → allocationId

  await db.transaction(async (tx) => {
    // Reserve all items across all sellers
    await reserveItems(reservationTargets, tx);

    // Insert order_group
    const [group] = await tx
      .insert(orderGroups)
      .values({
        buyerId,
        channelId,
        cartId: cart.id,
        status: "created",
        chargeType,
        quoteHash,
        subtotalCents: groupSubtotal,
        shippingCents: groupShipping,
        platformFeeCents: groupPlatformFee,
        sellerProceedsCents: groupSellerProceeds,
        totalCents: groupTotal,
        currency: currency.toUpperCase(),
        shippingAddressId,
        expiresAt,
      })
      .returning({ id: orderGroups.id });

    orderGroupId = group!.id;

    // Insert N allocations + N×items
    for (const sellerId of sellerIds) {
      const sellerData = sellerMap.get(sellerId)!;
      const totals = sellerTotals.get(sellerId)!;

      const [allocation] = await tx
        .insert(orderGroupSellerAllocations)
        .values({
          orderGroupId,
          sellerId,
          status: "pending",
          subtotalCents: totals.subtotalCents,
          shippingCents: totals.shippingCents,
          platformFeeCents: totals.platformFeeCents,
          sellerProceedsCents: totals.sellerProceedsCents,
          totalCents: totals.totalCents,
          currency: currency.toUpperCase(),
        })
        .returning({ id: orderGroupSellerAllocations.id });

      const allocationId = allocation!.id;
      allocationIds.set(sellerId, allocationId);

      // Insert allocation items
      await tx.insert(orderGroupAllocationItems).values(
        sellerData.items.map((item) => ({
          allocationId,
          orderGroupId,
          channelListingId: item.channelListingId,
          priceCents: item.priceCents,
          currency: currency.toUpperCase(),
        })),
      );
    }
  });

  const inventoryItemIds = reservationTargets.map((r) => r.inventoryItemId);

  // 10. LB-F8-WAL: createPaymentOp BEFORE Stripe call
  const paymentOp = await createPaymentOp(
    null, // orderId is null for multi-vendor (W2+) checkout
    "charge",
    orderGroupId, // idempotency key = orderGroupId
    groupTotal,
    orderGroupId,
  );
  const paymentOpId = paymentOp.id;

  // 11. Stripe PaymentIntent
  const stripe = getStripe();
  let stripeClientSecret: string;

  try {
    const singleSeller = chargeType === "destination" ? sellerMap.get(sellerIds[0]!) : undefined;
    // application_fee_amount is everything the platform withholds from the
    // destination transfer: commission PLUS prepaid label deductions
    // (total - proceeds). Withholding only the commission would leak the
    // label cost to the seller (cross-model review finding, task 9).
    const singleAllocationPlatformFee = (() => {
      if (chargeType !== "destination") return undefined;
      const totals = sellerTotals.get(sellerIds[0]!)!;
      return totals.totalCents - totals.sellerProceedsCents;
    })();

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: groupTotal,
        currency: currency.toLowerCase(),
        // W4 decision: card + Apple/Google Pay only — see the matching
        // exclusion in checkout/service.ts for why Link is excluded here too.
        payment_method_types: ["card"],
        ...(chargeType === "destination" && singleSeller
          ? {
              transfer_data: {
                destination: singleSeller.stripeAccountId,
              },
              application_fee_amount: singleAllocationPlatformFee,
            }
          : {
              transfer_group: orderGroupId,
            }),
        metadata: {
          orderGroupId,
          buyerId,
          chargeType,
          channelId,
          allocationIds: [...allocationIds.values()].join(","),
        },
      },
      {
        idempotencyKey: orderGroupId,
      },
    );

    if (!paymentIntent.client_secret) {
      throw new Error("Stripe PaymentIntent missing client_secret");
    }

    stripeClientSecret = paymentIntent.client_secret;
    const stripePaymentIntentId = paymentIntent.id;

    // 12. On success: succeedPaymentOp + CAS order_group → payment_pending
    await succeedPaymentOp(paymentOpId, stripePaymentIntentId);

    await db
      .update(orderGroups)
      .set({
        status: "payment_pending",
        stripePaymentIntentId,
        stripeClientSecret,
        version: sql`${orderGroups.version} + 1`,
      })
      .where(
        and(
          eq(orderGroups.id, orderGroupId),
          eq(orderGroups.status, "created"),
        ),
      );
  } catch (stripeErr) {
    const isStripe5xx =
      stripeErr &&
      typeof stripeErr === "object" &&
      "statusCode" in stripeErr &&
      typeof (stripeErr as { statusCode: unknown }).statusCode === "number" &&
      (stripeErr as { statusCode: number }).statusCode >= 500;

    if (isStripe5xx) {
      // 13. Stripe 5xx: indeterminate — mark WAL + set reconciliation flag
      await markIndeterminate5xx(
        paymentOpId,
        String((stripeErr as { message?: string }).message ?? stripeErr),
      );
      await db
        .update(orderGroups)
        .set({ hasPendingReconciliation: true })
        .where(eq(orderGroups.id, orderGroupId));

      console.error("[checkout-groups] Stripe 5xx — marked indeterminate:", stripeErr);
      throw new AppError(
        "Payment initialisation encountered an error. Please try again.",
        502,
        "STRIPE_5XX",
      );
    } else {
      // 14. Stripe 4xx client error: fail WAL + expire group + release items
      await failPaymentOp(
        paymentOpId,
        String((stripeErr as { message?: string }).message ?? stripeErr),
      );
      await db
        .update(orderGroups)
        .set({ status: "expired", version: sql`${orderGroups.version} + 1` })
        .where(
          and(
            eq(orderGroups.id, orderGroupId),
            eq(orderGroups.status, "created"),
          ),
        );
      await releaseItems(inventoryItemIds);

      console.error("[checkout-groups] Stripe 4xx — failed:", stripeErr);
      throw new AppError(
        "Payment initialisation failed. Please try again.",
        502,
        "STRIPE_ERROR",
      );
    }
  }

  // 15. Build response
  const groupTotals: CheckoutGroupTotals = {
    subtotalCents: groupSubtotal,
    shippingCents: groupShipping,
    platformFeeCents: groupPlatformFee,
    sellerProceedsCents: groupSellerProceeds,
    totalCents: groupTotal,
    currency,
  };

  const allocations: AllocationSummary[] = sellerIds.map((sellerId) => {
    const totals = sellerTotals.get(sellerId)!;
    const sellerData = sellerMap.get(sellerId)!;
    return {
      allocationId: allocationIds.get(sellerId)!,
      sellerId,
      status: "pending" as const,
      subtotalCents: totals.subtotalCents,
      shippingCents: totals.shippingCents,
      platformFeeCents: totals.platformFeeCents,
      sellerProceedsCents: totals.sellerProceedsCents,
      totalCents: totals.totalCents,
      itemIds: sellerData.items.map((i) => i.channelListingId),
    };
  });

  return {
    orderGroupId,
    clientSecret: stripeClientSecret!,
    chargeType,
    totals: groupTotals,
    allocations,
    expiresAt,
  };
}

/**
 * Get an order_group by ID with its allocations summary.
 *
 * Ownership verified: must belong to buyerId.
 */
export async function getCheckoutGroup(
  orderGroupId: string,
  buyerId: string,
): Promise<CheckoutGroupStatusResponse> {
  const [group] = await db
    .select()
    .from(orderGroups)
    .where(
      and(eq(orderGroups.id, orderGroupId), eq(orderGroups.buyerId, buyerId)),
    );

  if (!group) {
    throw new NotFoundError("Checkout group not found");
  }

  // Load allocations with their item IDs
  const allocationRows = await db
    .select({
      id: orderGroupSellerAllocations.id,
      sellerId: orderGroupSellerAllocations.sellerId,
      status: orderGroupSellerAllocations.status,
      subtotalCents: orderGroupSellerAllocations.subtotalCents,
      shippingCents: orderGroupSellerAllocations.shippingCents,
      platformFeeCents: orderGroupSellerAllocations.platformFeeCents,
      sellerProceedsCents: orderGroupSellerAllocations.sellerProceedsCents,
      totalCents: orderGroupSellerAllocations.totalCents,
    })
    .from(orderGroupSellerAllocations)
    .where(eq(orderGroupSellerAllocations.orderGroupId, orderGroupId));

  const allocationItemRows = await db
    .select({
      allocationId: orderGroupAllocationItems.allocationId,
      channelListingId: orderGroupAllocationItems.channelListingId,
    })
    .from(orderGroupAllocationItems)
    .where(eq(orderGroupAllocationItems.orderGroupId, orderGroupId));

  const itemsByAllocation = new Map<string, string[]>();
  for (const item of allocationItemRows) {
    const existing = itemsByAllocation.get(item.allocationId) ?? [];
    existing.push(item.channelListingId);
    itemsByAllocation.set(item.allocationId, existing);
  }

  const allocations: AllocationSummary[] = allocationRows.map((a) => ({
    allocationId: a.id,
    sellerId: a.sellerId,
    status: a.status as AllocationSummary["status"],
    subtotalCents: a.subtotalCents,
    shippingCents: a.shippingCents,
    platformFeeCents: a.platformFeeCents,
    sellerProceedsCents: a.sellerProceedsCents,
    totalCents: a.totalCents,
    itemIds: itemsByAllocation.get(a.id) ?? [],
  }));

  const totals: CheckoutGroupTotals = {
    subtotalCents: group.subtotalCents,
    shippingCents: group.shippingCents,
    platformFeeCents: group.platformFeeCents,
    sellerProceedsCents: group.sellerProceedsCents,
    totalCents: group.totalCents,
    currency: group.currency,
  };

  return {
    orderGroupId: group.id,
    status: group.status as CheckoutGroupStatusResponse["status"],
    chargeType: group.chargeType as CheckoutGroupStatusResponse["chargeType"],
    totals,
    allocations,
    expiresAt: group.expiresAt,
  };
}

/**
 * Cancel a checkout group pre-payment.
 *
 * CAS: order_group.status payment_pending → cancelled.
 * Releases all reserved inventory.
 * Cancels the Stripe PaymentIntent (best-effort).
 *
 * Rejects from terminal states (confirming, paid_unallocated, allocated, etc.).
 */
export async function cancelCheckoutGroup(
  orderGroupId: string,
  buyerId: string,
): Promise<void> {
  const [group] = await db
    .select()
    .from(orderGroups)
    .where(
      and(eq(orderGroups.id, orderGroupId), eq(orderGroups.buyerId, buyerId)),
    );

  if (!group) {
    throw new NotFoundError("Checkout group not found");
  }

  if (group.status !== "payment_pending" && group.status !== "created") {
    throw new ConflictError(
      `Cannot cancel checkout group in status '${group.status}'. ` +
        "Cancellation is only allowed from 'created' or 'payment_pending'.",
    );
  }

  // CAS transition: → cancelled
  const result = await db
    .update(orderGroups)
    .set({
      status: "cancelled",
      version: sql`${orderGroups.version} + 1`,
    })
    .where(
      and(
        eq(orderGroups.id, orderGroupId),
        eq(orderGroups.version, group.version),
        inArray(orderGroups.status, ["created", "payment_pending"] as string[]),
      ),
    )
    .returning({ id: orderGroups.id });

  if (result.length === 0) {
    throw new ConflictError(
      "Checkout group was modified concurrently. Please refresh and try again.",
    );
  }

  // Release all reserved inventory (resolved via allocation items, not cart)
  const inventoryItemIds = await getInventoryItemIdsForGroup(orderGroupId);
  await releaseItems(inventoryItemIds);

  // Cancel Stripe PaymentIntent (best-effort)
  if (group.stripePaymentIntentId) {
    const stripe = getStripe();
    await stripe.paymentIntents.cancel(group.stripePaymentIntentId).catch((err) => {
      console.error("[checkout-groups] Failed to cancel PaymentIntent on group cancel:", err);
    });
  }
}

/**
 * Helper: get all inventory item IDs reserved for a cart via order_group_allocation_items.
 * Used during cancel to release inventory without needing the cart items (which may have changed).
 */
async function getInventoryItemIdsForGroup(groupId: string): Promise<string[]> {
  const items = await db
    .select({ channelListingId: orderGroupAllocationItems.channelListingId })
    .from(orderGroupAllocationItems)
    .where(eq(orderGroupAllocationItems.orderGroupId, groupId));

  if (items.length === 0) return [];

  // Resolve channel listing → inventory item
  const listingIds = items.map((i) => i.channelListingId);
  const invRows = await db
    .select({ inventoryItemId: inventoryItems.id })
    .from(channelListings)
    .innerJoin(inventoryItems, eq(channelListings.inventoryItemId, inventoryItems.id))
    .where(inArray(channelListings.id, listingIds));

  return invRows.map((r) => r.inventoryItemId);
}
