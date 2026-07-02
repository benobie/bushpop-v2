import { db } from "@bushpop/db/client";
import { processedWebhookEvents, webhookDeadLetters } from "@bushpop/db/schema";
import { and, eq } from "drizzle-orm";

export async function isWebhookProcessed(
  provider: string,
  eventId: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: processedWebhookEvents.id })
    .from(processedWebhookEvents)
    .where(
      and(
        eq(processedWebhookEvents.provider, provider),
        eq(processedWebhookEvents.eventId, eventId),
      ),
    )
    .limit(1);

  return existing.length > 0;
}

export async function markWebhookProcessed(
  provider: string,
  eventId: string,
): Promise<void> {
  await db
    .insert(processedWebhookEvents)
    .values({ provider, eventId })
    .onConflictDoNothing();
}

export async function deadLetterWebhook(
  source: string,
  eventType: string,
  payload: unknown,
  errorMessage: string,
): Promise<void> {
  await db.insert(webhookDeadLetters).values({
    source,
    eventType,
    payload,
    errorMessage,
    retries: 0,
    status: "pending",
  });
}
