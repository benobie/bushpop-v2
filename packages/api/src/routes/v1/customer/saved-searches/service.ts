import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { savedSearches } from "@bushpop/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "../../../../lib/errors.js";
import { ulid } from "ulid";

const MAX_SAVED_SEARCHES = 20;
type SavedSearchFilters = Record<string, unknown>;
type SavedSearchRow = typeof savedSearches.$inferSelect;

function sortKeysRecursive(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    const mapped = obj.map(sortKeysRecursive);
    if (
      mapped.every((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    ) {
      return mapped.sort();
    }
    return mapped;
  }
  if (obj !== null && typeof obj === "object") {
    return Object.keys(obj as Record<string, unknown>)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = sortKeysRecursive((obj as Record<string, unknown>)[key]);
          return acc;
        },
        {} as Record<string, unknown>,
      );
  }
  return obj;
}

export function computeQueryHash(query: string, filters: SavedSearchFilters): string {
  const normalised = query.trim().toLowerCase();
  const sortedFilters = JSON.stringify(sortKeysRecursive(filters));
  return createHash("sha256")
    .update(normalised + sortedFilters)
    .digest("hex");
}

function formatSavedSearch(row: SavedSearchRow) {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    filters: row.filters as SavedSearchFilters,
    channelId: row.channelId,
    createdAt: new Date(row.createdAt as unknown as string).toISOString(),
    updatedAt: new Date(row.updatedAt as unknown as string).toISOString(),
  };
}

export async function createSavedSearch(
  userId: string,
  channelId: string,
  query: string,
  filters: SavedSearchFilters,
  name?: string,
) {
  const queryHash = computeQueryHash(query, filters);

  try {
    const result = await db.execute(sql`
      WITH locked_user AS (
        SELECT id
        FROM "user"
        WHERE id = ${userId}
        FOR UPDATE
      )
      INSERT INTO saved_searches (
        id,
        user_id,
        channel_id,
        name,
        query,
        filters,
        query_hash
      )
      SELECT
        ${ulid()},
        ${userId},
        ${channelId},
        ${name ?? null},
        ${query},
        ${JSON.stringify(filters)}::jsonb,
        ${queryHash}
      FROM locked_user
      WHERE (
        SELECT count(*)::int
        FROM saved_searches
        WHERE user_id = ${userId}
      ) < ${MAX_SAVED_SEARCHES}
      RETURNING
        id,
        user_id AS "userId",
        channel_id AS "channelId",
        name,
        query,
        filters,
        query_hash AS "queryHash",
        version,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `);
    const row = result[0] as SavedSearchRow | undefined;

    if (!row) {
      throw new ValidationError("Maximum saved searches reached");
    }

    return formatSavedSearch(row as SavedSearchRow);
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      throw err;
    }
    const pgErr = err as { code?: string; cause?: { code?: string } };
    if (pgErr.code === "23505" || pgErr.cause?.code === "23505") {
      throw new ConflictError("Saved search already exists for this query");
    }
    throw err;
  }
}

export async function listSavedSearches(userId: string, channelId?: string) {
  const conditions = [eq(savedSearches.userId, userId)];

  if (channelId) {
    conditions.push(eq(savedSearches.channelId, channelId));
  }

  const rows = await db
    .select()
    .from(savedSearches)
    .where(and(...conditions))
    .orderBy(desc(savedSearches.createdAt));

  return rows.map(formatSavedSearch);
}

export async function deleteSavedSearch(userId: string, searchId: string) {
  const deleted = await db
    .delete(savedSearches)
    .where(and(eq(savedSearches.id, searchId), eq(savedSearches.userId, userId)))
    .returning({ id: savedSearches.id });

  if (deleted.length === 0) {
    throw new NotFoundError("Saved search not found");
  }
}
