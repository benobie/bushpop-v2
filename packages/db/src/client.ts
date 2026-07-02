import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type ReservedSql, type Sql } from "postgres";
import * as schema from "./schema/index";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = postgres(connectionString);

/**
 * The raw postgres.js `Sql` client behind the Drizzle instance.
 *
 * Exposed so callers that need a *session-scoped* primitive — most notably a
 * `pg_advisory_lock` held across a network call (Stripe transfer) — can pin a
 * single dedicated connection via `pgClient.reserve()` and release it in a
 * `finally`. Do NOT use this for ordinary queries; use `db` (Drizzle) instead.
 *
 * @see ReservedSql.release — always release a reserved connection back to the pool.
 */
export const pgClient = client;

export const db = drizzle(client, { schema });

export type Database = typeof db;
export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbExecutor = Database | DbTransaction;

/**
 * Re-export of postgres.js `ReservedSql` so consumers (e.g. `@bushpop/api`) can
 * type a reserved connection without taking a direct `postgres` dependency.
 */
export type { ReservedSql } from "postgres";

/**
 * Run a transaction on an ALREADY-RESERVED postgres.js connection.
 *
 * Critical for the payout-release path (CRITICAL 1 + HIGH 2): a successful
 * release pins ONE connection via `pgClient.reserve()` and holds a
 * session-scoped `pg_advisory_lock` on it across the Stripe transfer. The
 * subsequent atomic finalisation (WAL-op success + hold finalise + order
 * column) MUST run on that SAME connection — calling `db.transaction()` would
 * grab a SECOND connection from the shared pool while the first is still
 * pinned, so each successful release would need two pool connections at once
 * and concurrent admin releases could self-deadlock / starve the pool (and,
 * because the `finally` is never reached, leak the advisory lock indefinitely).
 *
 * postgres.js (v3.4) does NOT expose `reserved.begin()` at runtime (the type
 * decl is aspirational), so we drive a real transaction manually with
 * `BEGIN` / `COMMIT` / `ROLLBACK` on the reserved connection and run the
 * Drizzle query builder (bound to that same connection) in between. The
 * advisory lock already in flight on `reserved` is unaffected — it is
 * session-scoped, not tied to this transaction.
 *
 * The returned Drizzle instance does NOT participate in the AsyncLocalStorage
 * `afterCommit` machinery (that lives on the pooled `db` only); callers needing
 * post-commit side effects must run them after `reservedTransaction` resolves.
 */
export async function reservedTransaction<T>(
  reserved: ReservedSql,
  callback: (tx: Database) => Promise<T>,
): Promise<T> {
  // The drizzle postgres-js driver reads `client.options.parsers/serializers`
  // at construction (to register transparent parsers). A reserved connection
  // does not expose `.options`, but it shares the base pool's `client.options`
  // — so forward `options` to the base client while routing query execution to
  // the reserved connection.
  const reservedWithOptions = new Proxy(reserved, {
    get(target, prop, receiver) {
      if (prop === "options") {
        return (client as unknown as { options: unknown }).options;
      }
      return Reflect.get(target as object, prop, receiver);
    },
  }) as unknown as Sql;
  const tx = drizzle(reservedWithOptions, { schema }) as unknown as Database;
  await reserved`BEGIN`;
  try {
    const result = await callback(tx);
    await reserved`COMMIT`;
    return result;
  } catch (error) {
    await reserved`ROLLBACK`.catch(() => {
      /* connection may already be in a failed/aborted state — surface the
         original error below regardless */
    });
    throw error;
  }
}

interface TransactionScope {
  tx: DbTransaction;
  afterCommitCallbacks: Array<() => Promise<void> | void>;
}

const transactionScopeStorage = new AsyncLocalStorage<TransactionScope>();
const transactionWrappedSymbol = Symbol.for("piklo.db.transactionWrapped");

type TransactionCapable = {
  transaction: Database["transaction"];
  [transactionWrappedSymbol]?: boolean;
};

function wrapTransactionMethod(target: TransactionCapable): void {
  if (target[transactionWrappedSymbol]) {
    return;
  }

  const originalTransaction = target.transaction.bind(target) as Database["transaction"];

  Object.defineProperty(target, transactionWrappedSymbol, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  const wrappedTransaction = (async (
    callback: (tx: DbTransaction) => Promise<unknown>,
    config?: Parameters<Database["transaction"]>[1],
  ) => {
    const parentScope = transactionScopeStorage.getStore();
    let currentScope: TransactionScope | undefined;

    const result = await originalTransaction(async (tx) => {
      wrapTransactionMethod(tx as unknown as TransactionCapable);

      currentScope = {
        tx,
        afterCommitCallbacks: [],
      };

      return transactionScopeStorage.run(currentScope, async () => callback(tx));
    }, config);

    if (!currentScope) {
      return result;
    }

    if (parentScope) {
      parentScope.afterCommitCallbacks.push(...currentScope.afterCommitCallbacks);
      return result;
    }

    for (const afterCommitCallback of currentScope.afterCommitCallbacks) {
      try {
        await afterCommitCallback();
      } catch (error) {
        console.error("[db] afterCommit callback failed:", error);
      }
    }

    return result;
  }) as Database["transaction"];

  Object.defineProperty(target, "transaction", {
    value: wrappedTransaction,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

wrapTransactionMethod(db as unknown as TransactionCapable);

export function getDbExecutor(): DbExecutor {
  return transactionScopeStorage.getStore()?.tx ?? db;
}

export function hasActiveTransaction(): boolean {
  return transactionScopeStorage.getStore() !== undefined;
}

export function registerAfterCommit(callback: () => Promise<void> | void): void {
  const scope = transactionScopeStorage.getStore();
  if (!scope) {
    throw new Error("registerAfterCommit called without an active transaction");
  }

  scope.afterCommitCallbacks.push(callback);
}

/**
 * Close the connection pool.
 * Call in test `afterAll` to prevent lingering connections
 * that can deadlock subsequent test runs.
 */
export async function endDb(): Promise<void> {
  await client.end();
}
