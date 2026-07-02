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
import { getPikloChannel } from "../../../../test/helpers/get-channel.js";
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
}): Promise<CartFixture> {
  const channel = await getPikloChannel();
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
