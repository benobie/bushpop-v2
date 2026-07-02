import { db } from "@bushpop/db/client";
import { user } from "@bushpop/db/schema";
import { ulid } from "ulid";

export async function createTestUser(overrides?: Partial<typeof user.$inferInsert>) {
  const id = ulid();
  const [row] = await db
    .insert(user)
    .values({
      id,
      name: overrides?.name ?? "Test User",
      email: overrides?.email ?? `test-${id.toLowerCase()}@example.com`,
      emailVerified: true,
      ...overrides,
    })
    .returning();
  return row!;
}
