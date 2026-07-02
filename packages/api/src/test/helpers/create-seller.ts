import { db } from "@bushpop/db/client";
import { userRoles, sellerProfiles } from "@bushpop/db/schema";
import { ulid } from "ulid";

/**
 * Grant seller role and create a seller profile for a test user.
 */
export async function createTestSeller(
  userId: string,
  overrides?: Partial<typeof sellerProfiles.$inferInsert>,
) {
  await db.insert(userRoles).values({ userId, role: "seller" });

  const [profile] = await db
    .insert(sellerProfiles)
    .values({
      userId,
      storeName: overrides?.storeName ?? "Test Store",
      handle: overrides?.handle ?? `test-${ulid().slice(-6).toLowerCase()}`,
      ...overrides,
    })
    .returning();

  return profile!;
}
