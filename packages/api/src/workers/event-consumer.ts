import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { marketplaceEvents } from "@bushpop/db/schema";
import { getRedis } from "../lib/redis.js";
import { enqueueEmail } from "./email.js";
import { enqueueListingScore } from "./listing-score.js";
import { enqueueSearchSync } from "./search-sync.js";

/** Events that must be fanned out to the search-sync queue. */
const SEARCH_SYNC_EVENTS = new Set([
  "channel_listing.created",
  "channel_listing.content_changed",
  "channel_listing.status_changed",
  "channel_listing.archived",
  "listing.visibility_changed",
  "seller_profile.updated",
  "listing_score.calculated",
]);

const QUEUE_NAME = "marketplace-events";

// ---------------------------------------------------------------------------
// Job data shape (mirrors dispatchEvent in lib/events.ts)
// ---------------------------------------------------------------------------

interface MarketplaceEventJobData {
  eventId: string;
  eventName: string;
  category: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  channelId?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

export async function processMarketplaceEvent(
  job: Job<MarketplaceEventJobData>,
): Promise<void> {
  const { eventId, eventName, category, entityId, metadata } = job.data;

  console.info(
    `[event-consumer] Processing ${eventName} (${category}) — eventId=${eventId}`,
  );

  // Mark the event as delivered in the audit log
  await db
    .update(marketplaceEvents)
    .set({ deliveryStatus: "delivered" })
    .where(eq(marketplaceEvents.id, eventId));

  // Fan out to search-sync queue if this event affects MeiliSearch
  if (SEARCH_SYNC_EVENTS.has(eventName)) {
    await enqueueSearchSync(job.data).catch((err: unknown) => {
      console.error(`[event-consumer] Failed to fan out ${eventName} to search-sync:`, err);
    });
  }

  // Per-event side-effects (Phase 2B basic reactions)
  await handleEventSideEffects(eventName, entityId, metadata);

  console.info(
    `[event-consumer] Delivered ${eventName} (eventId=${eventId})`,
  );
}

// ---------------------------------------------------------------------------
// Event side-effects
// ---------------------------------------------------------------------------

async function handleEventSideEffects(
  eventName: string,
  entityId: string | undefined,
  metadata: Record<string, unknown> | undefined,
): Promise<void> {
  switch (eventName) {
    case "order.delivered": {
      // Log delivery event — full hold-policy evaluation wired in Step 4
      const orderId = (metadata?.orderId as string | undefined) ?? entityId;
      console.info(`[event-consumer] order.delivered — orderId=${orderId}`);
      break;
    }

    case "order.shipped": {
      // Notify buyer that their order has been shipped
      const orderId = (metadata?.orderId as string | undefined) ?? entityId;
      console.info(`[event-consumer] order.shipped — orderId=${orderId}, enqueuing shipping confirmation`);
      if (orderId) {
        await enqueueEmail({ type: "shipping_confirmation_buyer", orderId }).catch((err: unknown) => {
          console.error(`[event-consumer] Failed to enqueue shipping_confirmation_buyer email for order ${orderId}:`, err);
        });
      }
      break;
    }

    case "order.tracking_exception": {
      // Alert email for tracking exceptions — full handler wired in Step 4
      const orderId = (metadata?.orderId as string | undefined) ?? entityId;
      console.warn(`[event-consumer] order.tracking_exception — orderId=${orderId}, enqueuing admin alert`);
      if (orderId) {
        await enqueueEmail({ type: "tracking_exception_admin", orderId }).catch((err: unknown) => {
          console.error(`[event-consumer] Failed to enqueue tracking_exception_admin email for order ${orderId}:`, err);
        });
      }
      break;
    }

    case "channel_listing.created":
    case "channel_listing.content_changed": {
      // Enqueue listing-score job for recalculation
      if (entityId) {
        await enqueueListingScore(entityId).catch((err: unknown) => {
          console.error(`[event-consumer] Failed to enqueue listing-score for listing ${entityId}:`, err);
        });
      }
      break;
    }

    default:
      // No additional side-effects for other events yet
      break;
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/**
 * Start the marketplace-events BullMQ consumer.
 *
 * Uses direct queue enqueue (no generic abstraction) per SA-1 R1.
 */
export function startEventConsumer(): Worker {
  const connection = getRedis();

  const worker = new Worker<MarketplaceEventJobData>(
    QUEUE_NAME,
    processMarketplaceEvent,
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[event-consumer] Job ${job?.id} failed (event=${job?.data?.eventName}):`,
      err.message,
    );
  });

  return worker;
}
