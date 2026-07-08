import { Worker, Queue, type Job } from "bullmq";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { orders, payoutHolds, sellerProfiles } from "@bushpop/db/schema";
import { getRedis } from "../lib/redis.js";
import { getShippingProvider } from "../lib/shipping/index.js";
import { dispatchEvent } from "../lib/events.js";
import { evaluateHoldPolicy } from "../lib/payout-hold-service.js";

// ── Queue setup ──

const STARSHIPIT_POLL_QUEUE = "starshipit-poll";
const POLL_JOB_NAME = "poll-shipped-orders";
const BATCH_SIZE = 50;
const RATE_LIMIT_DELAY_MS = 100;
const STALE_DAYS = 14;

let starshipitPollQueue: Queue | null = null;

function getStarshipitPollQueue(): Queue {
  if (!starshipitPollQueue) {
    starshipitPollQueue = new Queue(STARSHIPIT_POLL_QUEUE, {
      connection: getRedis(),
    });
  }
  return starshipitPollQueue;
}

// ── Status mapping (mirrors webhook handler logic) ──

type StatusAction =
  | "dispatched"
  | "in_transit"
  | "delivered"
  | "exception"
  | "unknown";

function mapStarshipitStatus(status: string): StatusAction {
  const s = status.toLowerCase();
  switch (s) {
    case "dispatched":
      return "dispatched";
    case "intransit":
    case "in_transit":
    case "attempteddelivery":
    case "attempted_delivery":
    case "awaitingcollection":
    case "awaiting_collection":
      return "in_transit";
    case "delivered":
      return "delivered";
    case "exception":
      return "exception";
    default:
      return "unknown";
  }
}

// ── Sleep helper for rate limiting ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Job processor ──

async function processStarshipitPoll(_job: Job): Promise<void> {
  console.info("[starshipit-poll] Starting poll of shipped orders");

  const provider = getShippingProvider();
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);

  // Fetch shipped orders with tracking numbers (batch of 50)
  const shippedOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.status, "shipped"),
        isNotNull(orders.trackingNumber),
      ),
    )
    .limit(BATCH_SIZE);

  console.info(`[starshipit-poll] Found ${shippedOrders.length} shipped orders to poll`);

  for (const order of shippedOrders) {
    const trackingNumber = order.trackingNumber!;

    // ── Dead-letter check: shipped >14 days with no delivery ──
    if (order.createdAt < staleThreshold) {
      console.warn(
        `[starshipit-poll] Order ${order.id} shipped >14 days ago with no delivery — dispatching tracking_stale event`,
      );
      await dispatchEvent({
        eventName: "order.tracking_stale",
        category: "order",
        entityType: "order",
        entityId: order.id,
        metadata: {
          orderId: order.id,
          trackingNumber,
          daysSinceCreated: Math.floor(
            (now.getTime() - order.createdAt.getTime()) / (24 * 60 * 60 * 1000),
          ),
        },
      }).catch((err: unknown) => {
        console.error(
          `[starshipit-poll] Failed to dispatch tracking_stale for order ${order.id}:`,
          err,
        );
      });
    }

    // ── Poll tracking status ──
    try {
      const trackingStatus = await provider.getTrackingStatus(trackingNumber);

      const action = mapStarshipitStatus(trackingStatus.status);
      const eventAt = trackingStatus.lastUpdated ? new Date(trackingStatus.lastUpdated) : now;

      // Dedup: skip if status hasn't changed
      if (
        order.lastTrackingStatus === trackingStatus.status &&
        order.lastTrackingEventAt !== null &&
        trackingStatus.lastUpdated &&
        order.lastTrackingEventAt.toISOString() === eventAt.toISOString()
      ) {
        console.info(
          `[starshipit-poll] Order ${order.id} tracking unchanged (${trackingStatus.status}) — skipping`,
        );
        // Rate limit even for no-ops
        await sleep(RATE_LIMIT_DELAY_MS);
        continue;
      }

      switch (action) {
        case "dispatched": {
          // CAS: paid → shipped
          const casResult = await db
            .update(orders)
            .set({
              status: "shipped",
              lastTrackingStatus: trackingStatus.status,
              lastTrackingEventAt: eventAt,
            })
            .where(
              and(
                eq(orders.id, order.id),
                eq(orders.status, "paid"),
              ),
            )
            .returning({ id: orders.id });
          if (casResult.length === 0) {
            // Already shipped (or another terminal state) — just update tracking fields
            await db
              .update(orders)
              .set({ lastTrackingStatus: trackingStatus.status, lastTrackingEventAt: eventAt })
              .where(eq(orders.id, order.id));
          } else {
            // Drives the buyer's shipping_confirmation_buyer email via
            // event-consumer.ts's order.shipped handler. Defensive today —
            // the poll query only selects already-shipped orders so this CAS
            // never wins — but keeps the email contract intact if that query
            // ever broadens to paid orders. Gated on the CAS win, so at most
            // once per order.
            await dispatchEvent({
              eventName: "order.shipped",
              category: "order",
              actorId: "system",
              entityType: "order",
              entityId: order.id,
              channelId: order.channelId,
              metadata: {
                trackingNumber,
                carrier: order.trackingCarrier ?? null,
              },
            }).catch((err: unknown) => {
              console.error(
                `[starshipit-poll] Failed to dispatch order.shipped for order ${order.id}:`,
                err,
              );
            });
          }
          console.info(`[starshipit-poll] Order ${order.id}: dispatched event processed`);
          break;
        }

        case "in_transit": {
          await db
            .update(orders)
            .set({ lastTrackingStatus: trackingStatus.status, lastTrackingEventAt: eventAt })
            .where(eq(orders.id, order.id));
          console.info(`[starshipit-poll] Order ${order.id}: tracking updated (${trackingStatus.status})`);
          break;
        }

        case "delivered": {
          const deliveryResult = await db
            .update(orders)
            .set({
              status: "delivered",
              lastTrackingStatus: trackingStatus.status,
              lastTrackingEventAt: eventAt,
              deliveryConfirmedAt: now,
            })
            .where(
              and(
                eq(orders.id, order.id),
                eq(orders.status, "shipped"),
              ),
            )
            .returning({ id: orders.id });

          if (deliveryResult.length === 0) {
            console.info(
              `[starshipit-poll] Order ${order.id}: delivered event — not in shipped state, no-op`,
            );
            break;
          }

          console.info(`[starshipit-poll] Order ${order.id}: transitioned shipped → delivered`);

          // Mirror webhook handler: update payout hold + evaluate hold policy
          const [payoutHold] = await db
            .select()
            .from(payoutHolds)
            .where(eq(payoutHolds.orderId, order.id))
            .limit(1);

          if (payoutHold) {
            await db
              .update(payoutHolds)
              .set({ deliveryConfirmedAt: now })
              .where(eq(payoutHolds.id, payoutHold.id));

            const [sellerProfile] = await db
              .select({ userId: sellerProfiles.userId, createdAt: sellerProfiles.createdAt })
              .from(sellerProfiles)
              .where(eq(sellerProfiles.userId, order.sellerId))
              .limit(1);

            if (sellerProfile) {
              try {
                const [updatedOrder] = await db
                  .select()
                  .from(orders)
                  .where(eq(orders.id, order.id));
                const [updatedHold] = await db
                  .select()
                  .from(payoutHolds)
                  .where(eq(payoutHolds.id, payoutHold.id));

                if (updatedOrder && updatedHold) {
                  const orderForPolicy = {
                    ...updatedOrder,
                    status: updatedOrder.status as import("@bushpop/types").OrderStatus,
                    shippingAddressSnapshot: updatedOrder.shippingAddressSnapshot as import("@bushpop/types").AddressSnapshot | null,
                    senderAddressSnapshot: updatedOrder.senderAddressSnapshot as import("@bushpop/types").AddressSnapshot | null,
                    isInternational: updatedOrder.isInternational ?? null,
                    items: [],
                  };
                  const holdForPolicy = {
                    ...updatedHold,
                    status: updatedHold.status as import("@bushpop/types").PayoutHoldStatus,
                  };

                  const policyResult = await evaluateHoldPolicy(
                    orderForPolicy,
                    sellerProfile,
                    holdForPolicy,
                  );

                  await db
                    .update(payoutHolds)
                    .set({ holdPolicyApplied: policyResult.policyName })
                    .where(eq(payoutHolds.id, payoutHold.id));

                  console.info(
                    `[starshipit-poll] Order ${order.id}: hold policy applied (${policyResult.policyName})`,
                  );
                }
              } catch (err) {
                console.error(
                  `[starshipit-poll] Order ${order.id}: failed to evaluate hold policy — skipping (non-fatal):`,
                  err,
                );
              }
            } else {
              console.warn(
                `[starshipit-poll] Order ${order.id}: seller profile not found — hold policy not applied`,
              );
            }
          } else {
            console.warn(
              `[starshipit-poll] Order ${order.id}: no payout hold found for delivered order`,
            );
          }
          break;
        }

        case "exception": {
          await db
            .update(orders)
            .set({ lastTrackingStatus: trackingStatus.status, lastTrackingEventAt: eventAt })
            .where(eq(orders.id, order.id));

          await dispatchEvent({
            eventName: "order.tracking_exception",
            category: "order",
            entityType: "order",
            entityId: order.id,
            metadata: { orderId: order.id, trackingNumber, status: trackingStatus.status },
          }).catch((err: unknown) => {
            console.error(
              `[starshipit-poll] Failed to dispatch tracking_exception for order ${order.id}:`,
              err,
            );
          });
          console.warn(`[starshipit-poll] Order ${order.id}: tracking exception`);
          break;
        }

        default: {
          await db
            .update(orders)
            .set({ lastTrackingStatus: trackingStatus.status, lastTrackingEventAt: eventAt })
            .where(eq(orders.id, order.id));
          console.warn(
            `[starshipit-poll] Order ${order.id}: unknown status "${trackingStatus.status}"`,
          );
          break;
        }
      }
    } catch (err) {
      console.error(
        `[starshipit-poll] Failed to poll tracking for order ${order.id} (${trackingNumber}):`,
        err,
      );
    }

    // Rate limiting: 100ms delay between API calls (within 20 req/sec limit)
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  console.info("[starshipit-poll] Poll complete");
}

// ── Enqueue repeatable job ──

export async function scheduleStarshipitPoll(): Promise<void> {
  const queue = getStarshipitPollQueue();

  // Daily at 9:20am AEST — idempotent via upsertJobScheduler
  await queue.upsertJobScheduler(
    POLL_JOB_NAME,
    { pattern: "20 9 * * *", tz: "Australia/Sydney" },
    { name: POLL_JOB_NAME, opts: { removeOnComplete: true, removeOnFail: 3 } },
  );

  console.info("[starshipit-poll] Repeatable poll job scheduled (9:20am AEST daily)");
}

// ── Worker ──

export function startStarshipitPollWorker(): Worker {
  const connection = getRedis();

  const worker = new Worker(
    STARSHIPIT_POLL_QUEUE,
    processStarshipitPoll,
    {
      connection,
      concurrency: 1, // Poll jobs must not run concurrently
    },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[starshipit-poll] Job ${job?.id} failed:`,
      err.message,
    );
  });

  return worker;
}

// Export for use in tests and worker registry
export { STARSHIPIT_POLL_QUEUE };

// Export stale threshold for tests
export { STALE_DAYS };

// Export the stale orders query helper for polling tests
export async function getStaleShippedOrders() {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);

  return db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.status, "shipped"),
        isNotNull(orders.trackingNumber),
        lt(orders.createdAt, staleThreshold),
      ),
    );
}
