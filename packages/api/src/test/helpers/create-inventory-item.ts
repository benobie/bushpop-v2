import { db } from "@bushpop/db/client";
import { inventoryItems } from "@bushpop/db/schema";

export async function createTestInventoryItem(
  ownerId: string,
  overrides?: Partial<typeof inventoryItems.$inferInsert>,
) {
  const [row] = await db
    .insert(inventoryItems)
    .values({
      ownerId,
      condition: "good",
      ...overrides,
    })
    .returning();
  return row!;
}
