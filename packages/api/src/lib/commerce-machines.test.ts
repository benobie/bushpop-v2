import { describe, it, expect } from "vitest";
import type { OrderGroupStatus, SellerAllocationStatus } from "@bushpop/types";
import { InvalidTransitionError, transition } from "./state-machine.js";
import {
  ORDER_GROUP_MACHINE,
  ORDER_GROUP_ACTIVE_STATUSES,
  SELLER_ALLOCATION_MACHINE,
} from "./commerce-machines.js";

// ---------------------------------------------------------------------------
// ORDER_GROUP_MACHINE
// ---------------------------------------------------------------------------

describe("ORDER_GROUP_MACHINE", () => {
  const allowed: Array<[OrderGroupStatus, OrderGroupStatus]> = [
    ["created", "payment_pending"],
    ["created", "expired"],
    ["created", "cancelled"],
    ["payment_pending", "requires_action"],
    ["payment_pending", "confirming"],
    ["payment_pending", "paid_unallocated"],
    ["payment_pending", "allocated"],
    ["payment_pending", "payment_declined"],
    ["payment_pending", "expired"],
    ["payment_pending", "cancelled"],
    ["requires_action", "confirming"],
    ["requires_action", "paid_unallocated"],
    ["requires_action", "allocated"],
    ["requires_action", "payment_declined"],
    ["requires_action", "expired"],
    ["confirming", "paid_unallocated"],
    ["confirming", "allocated"],
    ["confirming", "payment_declined"],
    ["confirming", "expired"],
    ["paid_unallocated", "allocating"],
    ["allocating", "allocated"],
    ["allocating", "partially_failed"],
    ["partially_failed", "allocating"],
    ["partially_failed", "allocated"],
  ];

  it.each(allowed)("allows %s → %s", (from, to) => {
    expect(transition(ORDER_GROUP_MACHINE, "order_group", from, to)).toBe(to);
  });

  const terminals: OrderGroupStatus[] = [
    "allocated",
    "payment_declined",
    "expired",
    "cancelled",
  ];

  it.each(terminals)("%s is terminal (no outbound transitions)", (status) => {
    expect(ORDER_GROUP_MACHINE[status]).toBeUndefined();
  });

  const illegal: Array<[OrderGroupStatus, OrderGroupStatus]> = [
    // Skipping the pending/confirming steps on multi-seller flow
    ["created", "paid_unallocated"],
    ["created", "allocating"],
    ["created", "allocated"],
    // Illegal retries from terminals
    ["allocated", "payment_pending"],
    ["expired", "payment_pending"],
    ["cancelled", "payment_pending"],
    ["payment_declined", "payment_pending"],
    // Skipping allocation steps
    ["paid_unallocated", "allocated"],
    // Cannot cancel once paid
    ["paid_unallocated", "cancelled"],
    ["allocating", "cancelled"],
  ];

  it.each(illegal)("rejects %s → %s", (from, to) => {
    expect(() => transition(ORDER_GROUP_MACHINE, "order_group", from, to)).toThrow(
      InvalidTransitionError,
    );
  });

  it("ORDER_GROUP_ACTIVE_STATUSES covers pre-payment-success states only", () => {
    expect([...ORDER_GROUP_ACTIVE_STATUSES].sort()).toEqual(
      ["confirming", "created", "payment_pending", "requires_action"].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// SELLER_ALLOCATION_MACHINE
// ---------------------------------------------------------------------------

describe("SELLER_ALLOCATION_MACHINE", () => {
  const allowed: Array<[SellerAllocationStatus, SellerAllocationStatus]> = [
    ["pending", "charge_reserved"],
    ["pending", "cancelled"],
    ["charge_reserved", "transfer_pending"],
    ["charge_reserved", "transferred"],
    ["charge_reserved", "cancelled"],
    ["transfer_pending", "transferred"],
    ["transfer_pending", "transfer_retrying"],
    ["transfer_pending", "transfer_blocked"],
    ["transfer_retrying", "transferred"],
    ["transfer_retrying", "transfer_blocked"],
    ["transferred", "shipped"],
    ["transferred", "refunded"],
    ["shipped", "delivered"],
    ["shipped", "refunded"],
    ["delivered", "refunded"],
  ];

  it.each(allowed)("allows %s → %s", (from, to) => {
    expect(transition(SELLER_ALLOCATION_MACHINE, "seller_allocation", from, to)).toBe(to);
  });

  const terminals: SellerAllocationStatus[] = [
    "transfer_blocked",
    "refunded",
    "cancelled",
  ];

  it.each(terminals)("%s is terminal (no outbound transitions)", (status) => {
    expect(SELLER_ALLOCATION_MACHINE[status]).toBeUndefined();
  });

  const illegal: Array<[SellerAllocationStatus, SellerAllocationStatus]> = [
    // Skipping intermediate steps
    ["pending", "transferred"],
    ["pending", "transfer_pending"],
    ["pending", "shipped"],
    // Cannot cancel once transferred
    ["transferred", "cancelled"],
    ["shipped", "cancelled"],
    // Cannot retry from terminal
    ["transfer_blocked", "transfer_pending"],
    ["refunded", "transferred"],
    ["cancelled", "pending"],
  ];

  it.each(illegal)("rejects %s → %s", (from, to) => {
    expect(() =>
      transition(SELLER_ALLOCATION_MACHINE, "seller_allocation", from, to),
    ).toThrow(InvalidTransitionError);
  });

  it("InvalidTransitionError carries from/to/entity", () => {
    try {
      transition(SELLER_ALLOCATION_MACHINE, "seller_allocation", "pending", "shipped");
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      expect((err as InvalidTransitionError).from).toBe("pending");
      expect((err as InvalidTransitionError).to).toBe("shipped");
      expect((err as InvalidTransitionError).entity).toBe("seller_allocation");
    }
  });
});
