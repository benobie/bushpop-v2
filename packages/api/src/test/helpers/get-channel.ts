import { db } from "@bushpop/db/client";
import { channels } from "@bushpop/db/schema";
import { eq } from "drizzle-orm";

export async function getPikloChannel() {
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.slug, "piklo"));

  if (!channel) {
    throw new Error("Piklo channel not found in test DB — run seed first");
  }
  return channel;
}
