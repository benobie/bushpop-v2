import { db } from "@bushpop/db/client";
import { session } from "@bushpop/db/schema";
import { ulid } from "ulid";

/**
 * Create a session row directly in the DB (bypasses Better Auth).
 * Returns the session token string for use in cookie headers.
 */
export async function createTestSession(userId: string): Promise<string> {
  const token = ulid();
  await db.insert(session).values({
    id: ulid(),
    userId,
    token,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  });
  return token;
}
