import { db } from "@bushpop/db/client";
import { marketplaceEvents } from "@bushpop/db/schema";
import { eq } from "drizzle-orm";
import { Queue } from "bullmq";
import { getRedis } from "./redis";

const QUEUE_NAME = "marketplace-events";

let eventQueue: Queue | null = null;

function getEventQueue(): Queue {
  if (!eventQueue) {
    eventQueue = new Queue(QUEUE_NAME, {
      connection: getRedis(),
    });
  }
  return eventQueue;
}

interface DispatchEventInput {
  eventName: string;
  category: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  channelId?: string;
  metadata?: Record<string, unknown>;
}

export async function dispatchEvent(input: DispatchEventInput): Promise<string> {
  // 1. Write to audit log
  const rows = await db
    .insert(marketplaceEvents)
    .values({
      eventName: input.eventName,
      category: input.category,
      actorId: input.actorId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      channelId: input.channelId ?? null,
      metadata: input.metadata ?? null,
      deliveryStatus: "pending",
    })
    .returning();

  const event = rows[0];
  if (!event) {
    throw new Error("Failed to insert marketplace event");
  }

  // 2. Enqueue to BullMQ
  try {
    const queue = getEventQueue();
    await queue.add(input.eventName, {
      eventId: event.id,
      ...input,
    });

    // 3. Mark as dispatched
    await db
      .update(marketplaceEvents)
      .set({ deliveryStatus: "dispatched" })
      .where(eq(marketplaceEvents.id, event.id));
  } catch (err) {
    // Log but don't throw — daily re-index catches gaps
    console.error("Failed to enqueue event:", err);
  }

  return event.id;
}
