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

    const selectResults: unknown[] = [[anonCart], [], [realCart], [anonItem]];

    const nestedUpdateWhereMock = vi.fn().mockRejectedValue({ cause: { code: "23505" } });
    const addressUpdateWhereMock = vi.fn().mockResolvedValue(undefined);
    const insertValuesMock = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    });
    const deleteWhereMock = vi.fn().mockResolvedValue(undefined);

    const nestedTx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: nestedUpdateWhereMock,
      }),
    };

    const tx = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(async () => selectResults.shift() ?? []),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: addressUpdateWhereMock,
      }),
      insert: vi.fn().mockReturnValue({
        values: insertValuesMock,
      }),
      delete: vi.fn().mockReturnValue({
        where: deleteWhereMock,
      }),
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
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
    expect(addressUpdateWhereMock).toHaveBeenCalledTimes(1);
  });
});
