import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Database } from "@bushpop/db/client";
import { inventoryItems } from "@bushpop/db/schema";
import { ConflictError } from "./errors.js";

// Drizzle transaction type — compatible with both db and tx inside db.transaction()
type DbOrTx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ReservationTarget {
  inventoryItemId: string;
  version: number;
}

/**
 * Atomically reserves inventory items within an existing DB transaction.
 *
 * Uses compare-and-set (CAS) on `version` and `availability_status`:
 *   UPDATE inventory_items
 *   SET availability_status = 'reserved', version = version + 1
 *   WHERE id = ? AND version = ? AND availability_status = 'available'
 *
 * If any item fails to update (version mismatch or already reserved/sold),
 * throws ConflictError with code RESERVATION_CONFLICT. The caller must
 * handle rollback (or use a DB transaction).
 *
 * @param targets - Items to reserve (id + expected version)
 * @param tx - Drizzle transaction (or plain db for testing)
 */
export async function reserveItems(
  targets: ReservationTarget[],
  tx: DbOrTx = db,
): Promise<void> {
  if (targets.length === 0) return;

  // Process each item individually to detect per-item CAS failures
  for (const target of targets) {
    const result = await tx
      .update(inventoryItems)
      .set({
        availabilityStatus: "reserved",
        version: sql`${inventoryItems.version} + 1`,
      })
      .where(
        and(
          eq(inventoryItems.id, target.inventoryItemId),
          eq(inventoryItems.version, target.version),
          eq(inventoryItems.availabilityStatus, "available"),
        ),
      )
      .returning({ id: inventoryItems.id });

    if (result.length === 0) {
      throw new ConflictError(
        `Item ${target.inventoryItemId} is no longer available (reservation conflict)`,
      );
    }
  }
}

/**
 * Releases inventory reservations, returning items to 'available'.
 *
 * Safe to call even if items are already available (idempotent — only updates
 * rows where status = 'reserved'). Used on checkout cancel, expiry, and
 * Stripe failure cleanup.
 *
 * @param inventoryItemIds - IDs of items to release
 * @param tx - Drizzle transaction or plain db
 */
export async function releaseItems(
  inventoryItemIds: string[],
  tx: DbOrTx = db,
): Promise<void> {
  if (inventoryItemIds.length === 0) return;

  await tx
    .update(inventoryItems)
    .set({
      availabilityStatus: "available",
      version: sql`${inventoryItems.version} + 1`,
    })
    .where(
      and(
        inArray(inventoryItems.id, inventoryItemIds),
        eq(inventoryItems.availabilityStatus, "reserved"),
      ),
    );
}

/**
 * Fetches current inventory status for a list of items.
 * Used by post-expiry compensation to check re-availability.
 */
export async function getInventoryStatuses(
  inventoryItemIds: string[],
): Promise<Array<{ id: string; availabilityStatus: string; version: number }>> {
  if (inventoryItemIds.length === 0) return [];

  return db
    .select({
      id: inventoryItems.id,
      availabilityStatus: inventoryItems.availabilityStatus,
      version: inventoryItems.version,
    })
    .from(inventoryItems)
    .where(inArray(inventoryItems.id, inventoryItemIds));
}
