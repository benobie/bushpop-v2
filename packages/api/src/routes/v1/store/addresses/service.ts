import { eq, and, isNull, inArray, ne, desc } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { addresses, checkoutSessions, sellerProfiles } from "@bushpop/db/schema";
import { NotFoundError, ForbiddenError, ConflictError } from "../../../../lib/errors.js";
import { CHECKOUT_ACTIVE_STATUSES } from "../../../../lib/commerce-machines.js";
import type { z } from "zod";
import type { createAddressSchema, updateAddressSchema } from "./schemas.js";

type CreateInput = z.infer<typeof createAddressSchema>;
type UpdateInput = z.infer<typeof updateAddressSchema>;

// ── Helpers ──

async function findOwnedAddress(id: string, userId: string) {
  const [address] = await db
    .select()
    .from(addresses)
    .where(
      and(
        eq(addresses.id, id),
        isNull(addresses.deletedAt),
      ),
    );

  if (!address) {
    throw new NotFoundError("Address not found");
  }

  if (address.userId !== userId) {
    throw new ForbiddenError("Access denied");
  }

  return address;
}

// ── CRUD ──

export async function createAddress(userId: string, data: CreateInput) {
  return db.transaction(async (tx) => {
    if (data.isDefault) {
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(
          and(
            eq(addresses.userId, userId),
            eq(addresses.isDefault, true),
            isNull(addresses.deletedAt),
          ),
        );
    }

    const [address] = await tx
      .insert(addresses)
      .values({
        userId,
        label: data.label ?? null,
        line1: data.line1,
        line2: data.line2 ?? null,
        suburb: data.suburb,
        state: data.state,
        postcode: data.postcode,
        country: data.country,
        isDefault: data.isDefault,
      })
      .returning();

    if (data.isDefault) {
      await syncDefaultAddressToSellerProfile(userId, address!.id, tx);
    }

    return address!;
  });
}

export async function listAddresses(userId: string, limit = 50) {
  return db
    .select()
    .from(addresses)
    .where(
      and(
        eq(addresses.userId, userId),
        isNull(addresses.deletedAt),
      ),
    )
    .orderBy(desc(addresses.createdAt))
    .limit(limit);
}

export async function getAddress(id: string, userId: string) {
  return findOwnedAddress(id, userId);
}

export async function updateAddress(id: string, userId: string, data: UpdateInput) {
  await findOwnedAddress(id, userId);

  return db.transaction(async (tx) => {
    if (data.isDefault === true) {
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(
          and(
            eq(addresses.userId, userId),
            eq(addresses.isDefault, true),
            isNull(addresses.deletedAt),
            ne(addresses.id, id),
          ),
        );
    }

    const [updated] = await tx
      .update(addresses)
      .set({
        ...(data.label !== undefined && { label: data.label ?? null }),
        ...(data.line1 !== undefined && { line1: data.line1 }),
        ...(data.line2 !== undefined && { line2: data.line2 ?? null }),
        ...(data.suburb !== undefined && { suburb: data.suburb }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.postcode !== undefined && { postcode: data.postcode }),
        ...(data.country !== undefined && { country: data.country }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        updatedAt: new Date(),
      })
      // Ownership is already proven by findOwnedAddress() above. Repeating the
      // predicate here puts the guarantee in the query rather than in a caller's
      // memory, so extracting this update into a worker or batch job can't
      // silently reintroduce an IDOR with no test failing.
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .returning();

    if (data.isDefault === true) {
      await syncDefaultAddressToSellerProfile(userId, id, tx);
    }

    return updated!;
  });
}

export async function deleteAddress(id: string, userId: string) {
  const address = await findOwnedAddress(id, userId);

  // Guard: cannot soft-delete if referenced by an active checkout session
  const [activeCheckout] = await db
    .select({ id: checkoutSessions.id })
    .from(checkoutSessions)
    .where(
      and(
        eq(checkoutSessions.shippingAddressId, id),
        inArray(checkoutSessions.status, CHECKOUT_ACTIVE_STATUSES),
      ),
    )
    .limit(1);

  if (activeCheckout) {
    throw new ConflictError("Address is in use by an active checkout and cannot be deleted.");
  }

  await db
    .update(addresses)
    .set({ deletedAt: new Date() })
    // Ownership predicate in the query, not only in the findOwnedAddress()
    // pre-read above. See updateAddress().
    .where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
}

// ── Sync helper ──

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * When an address is set as default, also update the seller profile's
 * defaultShippingAddressId if the user has a seller profile.
 * No-op for buyer-only users.
 * Accepts an optional transaction (tx) so the sync runs inside the caller's transaction.
 */
async function syncDefaultAddressToSellerProfile(
  userId: string,
  addressId: string,
  tx: DbOrTx = db,
) {
  await tx
    .update(sellerProfiles)
    .set({ defaultShippingAddressId: addressId })
    .where(eq(sellerProfiles.userId, userId));
}
