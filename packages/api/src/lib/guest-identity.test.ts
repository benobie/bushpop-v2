import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  transaction: vi.fn(),
};

vi.mock("@bushpop/db/client", () => ({ db: mockDb }));

const { mergeAnonymousIdentity } = await import("./guest-identity.js");

describe("mergeAnonymousIdentity", () => {
  beforeEach(() => {
    mockDb.transaction.mockReset();
  });

  it("falls back to merge-with-dedup when re-parenting loses the cart uniqueness race", async () => {
    const anonCart = {
      id: "01JANONCART000000000000000",
      buyerId: "anon-user",
      channelId: "channel-1",
    };
    const realCart = {
      id: "01JREALCART00000000000000",
      buyerId: "real-user",
      channelId: "channel-1",
    };
    const anonItem = {
      id: "01JITEM000000000000000000",
      cartId: anonCart.id,
      channelListingId: "01JLISTING000000000000000",
      priceCents: 4200,
      currency: "AUD",
    };

    // In order: anon carts, real cart lookup, real cart re-read after the
    // 23505, the guest cart's checkout-session and order-group reference
    // probes (both empty → cart is free to delete), then its line items.
    const selectResults: unknown[] = [[anonCart], [], [realCart], [], [], [anonItem]];

    const nestedUpdateWhereMock = vi.fn().mockRejectedValue({ cause: { code: "23505" } });
    const insertValuesMock = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    });
    const deleteWhereMock = vi.fn().mockResolvedValue(undefined);

    // Every tx.update(...).set(...) payload, in call order, so we can assert
    // what got reassigned without depending on drizzle's table internals.
    const updatePayloads: Record<string, unknown>[] = [];

    const nestedTx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: nestedUpdateWhereMock,
      }),
    };

    const tx = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        // Awaitable, and also chainable with .limit() for the reference probes.
        where: vi.fn().mockImplementation(() => {
          const rows = selectResults.shift() ?? [];
          return Object.assign(Promise.resolve(rows), {
            limit: () => Promise.resolve(rows),
          });
        }),
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
      insert: vi.fn().mockReturnValue({
        values: insertValuesMock,
      }),
      delete: vi.fn().mockReturnValue({
        where: deleteWhereMock,
      }),
      execute: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn(async (cb: (inner: typeof nestedTx) => Promise<void>) => cb(nestedTx)),
    };

    mockDb.transaction.mockImplementation(async (cb: (inner: typeof tx) => Promise<void>) => cb(tx));

    await expect(mergeAnonymousIdentity("anon-user", "real-user")).resolves.toBeUndefined();

    expect(tx.transaction).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledWith({
      cartId: realCart.id,
      channelListingId: anonItem.channelListingId,
      priceCents: anonItem.priceCents,
      currency: anonItem.currency,
    });
    // The unreferenced guest cart is the one dropped, and no cart_id is ever
    // rewritten — a checkout session stays quoted against its own cart.
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
    expect(updatePayloads.some((p) => "cartId" in p)).toBe(false);

    // Every buyer-owned column moves to the real account.
    const reassigned = updatePayloads.filter(
      (p) => p.userId === "real-user" || p.buyerId === "real-user",
    );
    expect(reassigned.length).toBe(5); // addresses, orders, orderGroups, checkoutSessions, notifications

    // …and the three uniqueness-constrained tables move via guarded SQL.
    expect(tx.execute).toHaveBeenCalledTimes(3);
  });
});
