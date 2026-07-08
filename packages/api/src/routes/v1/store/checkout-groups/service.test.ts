/**
 * Checkout Groups service tests — ADR-015 Sprint 1b W2
 *
 * Tests:
 * 1. LB-F8-WAL ordering — payment_operations row inserted BEFORE Stripe call
 * 2. LB-M1 conservation — sum(allocation totals) === group totals
 * 3. LB-F10 confirming (partial) — CAS created→payment_pending guard
 * 4. Happy path destination — single seller, transfer_data.destination set
 * 5. Happy path SC&T — multi-seller, transfer_group set, no transfer_data
 * 6. Cancel releases inventory
 * 7. Seller-not-ready rejection — no reservations, no rows
 * 8. Stripe 5xx path — markIndeterminate5xx + hasPendingReconciliation
 * 9. FEE_MODEL_INCOMPLETE guard — posted carts refused (422, zero side
 *    effects) until Phase 2 wires Buyer Protection (WP-2,
 *    docs/engine/CHECKOUT-GROUPS-DESIGN.md); pickup-only carts pass.
 *    NOTE: cart fixtures default to shippingOption="pickup" for this reason.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ulid } from "ulid";
import { eq, and } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import {
  user,
  carts,
  cartItems,
  addresses,
  orderGroups,
  orderGroupSellerAllocations,
  orderGroupAllocationItems,
  paymentOperations,
  inventoryItems,
} from "@bushpop/db/schema";
import { getBushpopChannel } from "../../../../test/helpers/get-channel.js";
import { createTestUser } from "../../../../test/helpers/create-user.js";
import { createTestSeller } from "../../../../test/helpers/create-seller.js";
import { createActiveTestListing } from "../../../../test/helpers/create-listing.js";

// ---------------------------------------------------------------------------
// Mocks — declared before imports to allow vi.mock hoisting
// ---------------------------------------------------------------------------

vi.mock("../../../../lib/stripe.js");
vi.mock("../../../../lib/seller-readiness.js", () => ({
  assertCheckoutReady: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { getStripe } from "../../../../lib/stripe.js";
import { assertCheckoutReady } from "../../../../lib/seller-readiness.js";
import {
  createQuoteAndPaymentIntent,
  cancelCheckoutGroup,
  computeSellerTotals,
} from "./service.js";

// ---------------------------------------------------------------------------
// Stripe mock builders
// ---------------------------------------------------------------------------

function buildStripeMock(opts?: {
  throwErr?: unknown;
  piId?: string;
}) {
  const piCreate = vi.fn();

  if (opts?.throwErr) {
    piCreate.mockRejectedValue(opts.throwErr);
  } else {
    const id = opts?.piId ?? `pi_test_${ulid().toLowerCase()}`;
    piCreate.mockResolvedValue({
      id,
      client_secret: `${id}_secret`,
      status: "requires_payment_method",
    });
  }

  const piCancel = vi.fn().mockResolvedValue({ id: "cancelled", status: "canceled" });

  const stripe = {
    paymentIntents: { create: piCreate, cancel: piCancel },
  } as unknown as ReturnType<typeof getStripe>;

  vi.mocked(getStripe).mockReturnValue(stripe);

  return { piCreate, piCancel };
}

// ---------------------------------------------------------------------------
// DB fixture helpers
// ---------------------------------------------------------------------------

interface CartFixture {
  buyerId: string;
  channelId: string;
  cartId: string;
  addressId: string;
  sellers: Array<{
    sellerId: string;
    stripeAccountId: string;
    listingId: string;
    inventoryItemId: string;
    priceCents: number;
  }>;
}

/**
 * Creates a complete cart fixture with one or more sellers.
 * Each seller gets one listing in the cart.
 */
async function createCartFixture(opts: {
  sellerCount?: number;
  priceCents?: number;
  /**
   * Defaults to "pickup": pickup items owe $0 Buyer Protection, so pickup
   * carts are the only ones the FEE_MODEL_INCOMPLETE guard lets through
   * this path until Phase 2 (WP-2, docs/engine/CHECKOUT-GROUPS-DESIGN.md)
   * wires the real fee. Pass "buyer_pays"/"prepaid" (posted) to exercise
   * the guard's refusal path.
   */
  shippingOption?: "pickup" | "buyer_pays" | "prepaid";
}): Promise<CartFixture> {
  const channel = await getBushpopChannel();
  const buyer = await createTestUser();

  const [addr] = await db
    .insert(addresses)
    .values({
      userId: buyer.id,
      line1: "1 Test St",
      suburb: "Testville",
      state: "NSW",
      postcode: "2000",
      country: "AU",
    })
    .returning();

  const cartRow = await db
    .insert(carts)
    .values({ buyerId: buyer.id, channelId: channel.id })
    .returning();
  const cart = cartRow[0]!;

  const sellerCount = opts.sellerCount ?? 1;
  const priceCents = opts.priceCents ?? 5000;
  const sellers: CartFixture["sellers"] = [];

  for (let i = 0; i < sellerCount; i++) {
    const sellerUser = await createTestUser({ name: `Seller ${i}` });
    const stripeAccountId = `acct_test_${sellerUser.id.slice(-8).toLowerCase()}`;
    await createTestSeller(sellerUser.id, {
      stripeAccountId,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    });

    const listing = await createActiveTestListing(sellerUser.id, {
      priceCents,
      channelId: channel.id,
    });

    const shippingOption = opts.shippingOption ?? "pickup";
    await db
      .update(inventoryItems)
      .set({ shippingOption })
      .where(eq(inventoryItems.id, listing.inventoryItemId));

    // Get inventory item id
    const [invRow] = await db
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, listing.inventoryItemId));

    await db.insert(cartItems).values({
      cartId: cart.id,
      channelListingId: listing.id,
      priceCents,
    });

    sellers.push({
      sellerId: sellerUser.id,
      stripeAccountId,
      listingId: listing.id,
      inventoryItemId: invRow!.id,
      priceCents,
    });
  }

  return {
    buyerId: buyer.id,
    channelId: channel.id,
    cartId: cart.id,
    addressId: addr!.id,
    sellers,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("createQuoteAndPaymentIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertCheckoutReady).mockResolvedValue(undefined);
  });

  // ── Test 1: LB-F8-WAL ordering ──────────────────────────────────────────

  it("LB-F8-WAL: payment_operations row exists (status=pending) BEFORE Stripe call", async () => {
    const fixture = await createCartFixture({});
    let payOpRowExistedBeforeStripe = false;

    const { piCreate } = buildStripeMock();

    // Intercept stripe.paymentIntents.create and check DB state at call time
    piCreate.mockImplementation(async () => {
      const rows = await db
        .select()
        .from(paymentOperations)
        .where(
          and(
            eq(paymentOperations.type, "charge"),
            eq(paymentOperations.status, "pending"),
          ),
        );
      payOpRowExistedBeforeStripe = rows.length > 0;

      const id = `pi_test_wal_${ulid().toLowerCase()}`;
      return { id, client_secret: `${id}_secret`, status: "requires_payment_method" };
    });

    await createQuoteAndPaymentIntent(
      fixture.buyerId,
      fixture.channelId,
      fixture.addressId,
    );

    expect(payOpRowExistedBeforeStripe).toBe(true);
    expect(piCreate).toHaveBeenCalledTimes(1);
  });

  // ── Test 2: LB-M1 conservation ──────────────────────────────────────────

  it("LB-M1: sum(allocation.subtotal + shipping + platformFee) === group.totalCents", async () => {
    const fixture = await createCartFixture({ sellerCount: 2, priceCents: 6000 });
    buildStripeMock();

    const result = await createQuoteAndPaymentIntent(
      fixture.buyerId,
      fixture.channelId,
      fixture.addressId,
    );

    // Load the order_group from DB
    const [group] = await db
      .select()
      .from(orderGroups)
      .where(eq(orderGroups.id, result.orderGroupId));

    // Load allocations
    const allocs = await db
      .select()
      .from(orderGroupSellerAllocations)
      .where(eq(orderGroupSellerAllocations.orderGroupId, result.orderGroupId));

    expect(allocs).toHaveLength(2);

    // Conservation: sum of allocation totals should equal group total
    const allocSum = allocs.reduce((sum, a) => sum + a.totalCents, 0);
    expect(allocSum).toBe(group!.totalCents);

    // Also verify: group.subtotal + group.shipping === group.total
    expect(group!.subtotalCents + group!.shippingCents).toBe(group!.totalCents);
  });

  // ── Test 3: LB-F10 confirming (partial) ─────────────────────────────────

  it("LB-F10 (partial): CAS created→payment_pending guard — order_group transitions to payment_pending", async () => {
    const fixture = await createCartFixture({});
    const piId = `pi_test_cas_${ulid().toLowerCase()}`;
    buildStripeMock({ piId });

    const result = await createQuoteAndPaymentIntent(
      fixture.buyerId,
      fixture.channelId,
      fixture.addressId,
    );

    const [group] = await db
      .select({ status: orderGroups.status })
      .from(orderGroups)
      .where(eq(orderGroups.id, result.orderGroupId));

    expect(group!.status).toBe("payment_pending");
  });

  // W3: full grace-window CAS race + concurrent expiry transition
  it.skip("W3: concurrent expiry transition wins over payment_pending CAS", () => {
    // TODO W3: order-group expiry worker with LB-F10 confirming grace window
  });

  // ── Test 4: Happy path destination ──────────────────────────────────────

  it("happy path (single seller): chargeType=destination, PI has transfer_data.destination", async () => {
    const fixture = await createCartFixture({ sellerCount: 1 });
    const { piCreate } = buildStripeMock();

    const result = await createQuoteAndPaymentIntent(
      fixture.buyerId,
      fixture.channelId,
      fixture.addressId,
    );

    expect(result.chargeType).toBe("destination");
    expect(result.clientSecret).toMatch(/^pi_test_/);
    expect(result.allocations).toHaveLength(1);

    const piCallArgs = piCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(piCallArgs).toHaveProperty("transfer_data");
    expect(piCallArgs["transfer_data"]).toMatchObject({
      destination: fixture.sellers[0]!.stripeAccountId,
    });
    expect(piCallArgs).toHaveProperty("application_fee_amount");
    expect(piCallArgs).not.toHaveProperty("transfer_group");
  });

  // ── Test 4b: destination charge withholds the FULL platform take ─────────

  it("money lock: computeSellerTotals withholds fee+label but never Buyer Protection ($200 medium prepaid)", () => {
    // $200 medium prepaid — the accepted money case (task 9). Formerly
    // asserted through createQuoteAndPaymentIntent's PI call args, but the
    // FEE_MODEL_INCOMPLETE guard now refuses posted carts at the endpoint,
    // so the lock asserts against computeSellerTotals directly — the same
    // function that feeds the PI `amount` and the `application_fee_amount`
    // derivation (totalCents - sellerProceedsCents) on the destination path.
    const totals = computeSellerTotals(
      [
        {
          priceCents: 20000,
          shippingOption: "prepaid",
          parcelSize: "medium",
          shippingClass: "m",
        },
      ],
      "AUD",
    );

    // Buyer pays 20000 (no shipping on prepaid); platform withholds fee 380
    // + label 1095 = 1475 so the seller's auto-transfer nets exactly 18525.
    // Fee Model D regression lock: this item is "prepaid" (posted, not
    // pickup), so it attracts a 4%+50c = 850c Buyer Protection fee under the
    // shared calculateOrderTotals() — if computeSellerTotals() ever reverts
    // to using that totalCents as-is instead of recomputing subtotal+shipping
    // locally, `amount` becomes 20850 and/or `application_fee_amount`
    // balloons to 2325, over-withholding 850c from the seller's Stripe
    // Connect transfer. These assertions fail loudly if that regression is
    // reintroduced.
    expect(totals.totalCents).toBe(20000);
    expect(totals.sellerProceedsCents).toBe(18525);
    expect(totals.totalCents - totals.sellerProceedsCents).toBe(1475);
    // The BP shared math says SHOULD apply is surfaced (for the guard) but
    // never folded into totalCents on this path.
    expect(totals.buyerProtectionFeeCents).toBe(850);
  });

  // ── FEE_MODEL_INCOMPLETE guard ───────────────────────────────────────────

  it("guard: refuses a posted cart (422 FEE_MODEL_INCOMPLETE) — no reservation, no rows, no Stripe call", async () => {
    // buyer_pays = posted → shared fee math says BP is owed → this path
    // cannot charge it → the quote must be refused outright.
    const fixture = await createCartFixture({
      sellerCount: 2,
      shippingOption: "buyer_pays",
    });
    const { piCreate } = buildStripeMock();

    await expect(
      createQuoteAndPaymentIntent(fixture.buyerId, fixture.channelId, fixture.addressId),
    ).rejects.toMatchObject({ statusCode: 422, code: "FEE_MODEL_INCOMPLETE" });

    // Zero side effects: guard runs before reserveItems / the transaction / Stripe
    expect(piCreate).not.toHaveBeenCalled();

    const groups = await db
      .select()
      .from(orderGroups)
      .where(eq(orderGroups.buyerId, fixture.buyerId));
    expect(groups).toHaveLength(0);

    const ops = await db.select().from(paymentOperations);
    expect(ops).toHaveLength(0);

    for (const seller of fixture.sellers) {
      const [inv] = await db
        .select({ availabilityStatus: inventoryItems.availabilityStatus })
        .from(inventoryItems)
        .where(eq(inventoryItems.id, seller.inventoryItemId));
      expect(inv!.availabilityStatus).toBe("available");
    }
  });

  it("guard: refuses when ANY seller's items are posted (mixed pickup + prepaid cart)", async () => {
    const fixture = await createCartFixture({ sellerCount: 2 }); // both pickup
    // Flip one seller's item to prepaid (posted) — that allocation now owes BP.
    await db
      .update(inventoryItems)
      .set({ shippingOption: "prepaid", parcelSize: "medium", shippingClass: "m" })
      .where(eq(inventoryItems.id, fixture.sellers[1]!.inventoryItemId));
    const { piCreate } = buildStripeMock();

    await expect(
      createQuoteAndPaymentIntent(fixture.buyerId, fixture.channelId, fixture.addressId),
    ).rejects.toMatchObject({ statusCode: 422, code: "FEE_MODEL_INCOMPLETE" });
    expect(piCreate).not.toHaveBeenCalled();
  });

  it("guard: pickup-only cart (BP legitimately $0) passes and quotes normally", async () => {
    const fixture = await createCartFixture({ sellerCount: 2 }); // pickup default
    buildStripeMock();

    const result = await createQuoteAndPaymentIntent(
      fixture.buyerId,
      fixture.channelId,
      fixture.addressId,
    );

    expect(result.orderGroupId).toBeTruthy();
    expect(result.allocations).toHaveLength(2);
  });

  // ── Test 5: Happy path SC&T ──────────────────────────────────────────────

  it("happy path (multi-seller): chargeType=sct, PI has transfer_group, no transfer_data", async () => {
    const fixture = await createCartFixture({ sellerCount: 2 });
    const { piCreate } = buildStripeMock();

    const result = await createQuoteAndPaymentIntent(
      fixture.buyerId,
      fixture.channelId,
      fixture.addressId,
    );

    expect(result.chargeType).toBe("sct");
    expect(result.allocations).toHaveLength(2);

    const piCallArgs = piCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(piCallArgs["transfer_group"]).toBe(result.orderGroupId);
    expect(piCallArgs).not.toHaveProperty("transfer_data");
    expect(piCallArgs).not.toHaveProperty("application_fee_amount");
  });

  // ── Test 7: Seller-not-ready rejection ──────────────────────────────────

  it("rejects with ValidationError when a seller is not ready — no order_group, no payment_operations, no reservations", async () => {
    const fixture = await createCartFixture({});
    vi.mocked(assertCheckoutReady).mockRejectedValue(
      new Error("Cannot checkout: seller has not completed Stripe onboarding"),
    );

    await expect(
      createQuoteAndPaymentIntent(fixture.buyerId, fixture.channelId, fixture.addressId),
    ).rejects.toThrow("seller has not completed Stripe onboarding");

    // Verify no order_group was created
    const groups = await db
      .select()
      .from(orderGroups)
      .where(eq(orderGroups.buyerId, fixture.buyerId));
    expect(groups).toHaveLength(0);

    // Verify no payment_operations row was created
    const ops = await db.select().from(paymentOperations);
    expect(ops).toHaveLength(0);

    // Verify inventory is still available
    for (const seller of fixture.sellers) {
      const [inv] = await db
        .select({ availabilityStatus: inventoryItems.availabilityStatus })
        .from(inventoryItems)
        .where(eq(inventoryItems.id, seller.inventoryItemId));
      expect(inv!.availabilityStatus).toBe("available");
    }
  });

  // ── Test 8: Stripe 5xx path ──────────────────────────────────────────────

  it("Stripe 5xx: payment_operations transitions to indeterminate_5xx, group gets hasPendingReconciliation=true", async () => {
    const fixture = await createCartFixture({});
    const stripeErr = Object.assign(new Error("Internal server error"), {
      statusCode: 500,
      type: "api_connection_error",
    });
    buildStripeMock({ throwErr: stripeErr });

    await expect(
      createQuoteAndPaymentIntent(fixture.buyerId, fixture.channelId, fixture.addressId),
    ).rejects.toMatchObject({ code: "STRIPE_5XX" });

    // Verify payment_op is indeterminate_5xx
    const ops = await db
      .select({ status: paymentOperations.status })
      .from(paymentOperations)
      .where(eq(paymentOperations.type, "charge"));
    expect(ops).toHaveLength(1);
    expect(ops[0]!.status).toBe("indeterminate_5xx");

    // Verify order_group has hasPendingReconciliation=true
    const groups = await db
      .select({ hasPendingReconciliation: orderGroups.hasPendingReconciliation })
      .from(orderGroups)
      .where(eq(orderGroups.buyerId, fixture.buyerId));
    expect(groups).toHaveLength(1);
    expect(groups[0]!.hasPendingReconciliation).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cancelCheckoutGroup tests
// ---------------------------------------------------------------------------

describe("cancelCheckoutGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertCheckoutReady).mockResolvedValue(undefined);
  });

  // ── Test 6: Cancel releases inventory ───────────────────────────────────

  it("cancel releases inventory — inventory_items.availability_status back to available", async () => {
    const fixture = await createCartFixture({});
    const { piCreate, piCancel } = buildStripeMock();

    // First create the group
    const result = await createQuoteAndPaymentIntent(
      fixture.buyerId,
      fixture.channelId,
      fixture.addressId,
    );

    // Verify reserved before cancel
    const [invBefore] = await db
      .select({ availabilityStatus: inventoryItems.availabilityStatus })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, fixture.sellers[0]!.inventoryItemId));
    expect(invBefore!.availabilityStatus).toBe("reserved");

    // Cancel the group
    await cancelCheckoutGroup(result.orderGroupId, fixture.buyerId);

    // Verify inventory released
    for (const seller of fixture.sellers) {
      const [inv] = await db
        .select({ availabilityStatus: inventoryItems.availabilityStatus })
        .from(inventoryItems)
        .where(eq(inventoryItems.id, seller.inventoryItemId));
      expect(inv!.availabilityStatus).toBe("available");
    }

    // Verify group is cancelled
    const [group] = await db
      .select({ status: orderGroups.status })
      .from(orderGroups)
      .where(eq(orderGroups.id, result.orderGroupId));
    expect(group!.status).toBe("cancelled");

    // PI cancel was called
    expect(piCancel).toHaveBeenCalledTimes(1);
    void piCreate; // suppress unused warning
  });

  it("rejects cancel from 'confirming' or later terminal states with ConflictError", async () => {
    const fixture = await createCartFixture({});
    buildStripeMock();

    const result = await createQuoteAndPaymentIntent(
      fixture.buyerId,
      fixture.channelId,
      fixture.addressId,
    );

    // Force group to confirming status
    await db
      .update(orderGroups)
      .set({ status: "confirming" })
      .where(eq(orderGroups.id, result.orderGroupId));

    await expect(
      cancelCheckoutGroup(result.orderGroupId, fixture.buyerId),
    ).rejects.toThrow("Cannot cancel checkout group");
  });
});
