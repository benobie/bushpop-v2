import { db } from "@bushpop/db/client";
import { channels } from "@bushpop/db/schema";
import { eq } from "drizzle-orm";

export async function getBushpopChannel() {
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.slug, "bushpop"));

  if (!channel) {
    throw new Error("Bushpop channel not found in test DB — run seed first");
  }
  return channel;
}
