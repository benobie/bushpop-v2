import { eq, and } from "drizzle-orm";
import type { AnyPgTable, AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@bushpop/db/client";
import { ConflictError } from "./errors";

/**
 * A table that has `id` (varchar PK) and `version` (integer) columns.
 * Typed loosely so callers don't need to thread full generic params.
 */
export type VersionedTable = AnyPgTable & {
  id: AnyPgColumn;
  version: AnyPgColumn;
};

/**
 * Performs an optimistic-lock-guarded update.
 * The table MUST have `id` (varchar PK) and `version` (integer) columns.
 * Returns the new version number.
 */
export async function withOptimisticLock(
  table: VersionedTable,
  id: string,
  currentVersion: number,
  updates: Record<string, unknown>,
): Promise<number> {
  const newVersion = currentVersion + 1;

  const result = await db
    .update(table)
    .set({ ...updates, version: newVersion })
    .where(
      and(
        eq(table.id, id),
        eq(table.version, currentVersion),
      ),
    )
    .returning({ version: table.version });

  if (result.length === 0) {
    throw new ConflictError(
      "Resource was modified by another request. Please retry with the latest version.",
    );
  }

  return newVersion;
}
