import { Worker, Queue, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { orders } from "@bushpop/db/schema";
import { getRedis } from "../lib/redis.js";
import { getShippingProvider } from "../lib/shipping/index.js";
import type { ShippingAddress } from "../lib/shipping/types.js";

// ── Queue setup ──

const SHIPPING_LABEL_QUEUE = "shipping-label";

let shippingLabelQueue: Queue | null = null;

function getShippingLabelQueue(): Queue {
  if (!shippingLabelQueue) {
    shippingLabelQueue = new Queue(SHIPPING_LABEL_QUEUE, {
      connection: getRedis(),
    });
  }
  return shippingLabelQueue;
}

// ── Job data ──

export interface ShippingLabelJobData {
  orderId: string;
}

// ── Enqueue ──

/**
 * Enqueue a shipping label generation job for an order.
 *
 * Uses orderId as jobId for dedup — safe because each order has a unique ULID
 * and we only want one label per order.
 */
export async function enqueueShippingLabel(orderId: string): Promise<void> {
  const queue = getShippingLabelQueue();
  await queue.add(
    "generate-label",
    { orderId } satisfies ShippingLabelJobData,
    {
      jobId: `label-${orderId}`,
      removeOnComplete: true,
      removeOnFail: 3,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
    },
  );
}

// ── Worker ──

export function startShippingLabelWorker(): Worker {
  const connection = getRedis();

  const worker = new Worker<ShippingLabelJobData>(
    SHIPPING_LABEL_QUEUE,
    async (job: Job<ShippingLabelJobData>) => {
      const { orderId } = job.data;
      console.info(`[shipping-label] Processing label for order ${orderId}`);

      // Re-check order status — no-op if cancelled (FM-4 R2)
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId));

      if (!order) {
        console.warn(`[shipping-label] Order ${orderId} not found — skipping`);
        return;
      }

      if (order.status === "cancelled") {
        console.info(`[shipping-label] Order ${orderId} is cancelled — no-op`);
        return;
      }

      // Already has a label — idempotency guard
      if (order.trackingNumber) {
        console.info(`[shipping-label] Order ${orderId} already has tracking ${order.trackingNumber} — skipping`);
        return;
      }

      // Build addresses from snapshots
      const toAddr = buildAddress(order.shippingAddressSnapshot, "buyer");
      const fromAddr = buildAddress(order.senderAddressSnapshot, "seller");

      const provider = getShippingProvider();

      const result = await provider.createShipment({
        orderId,
        fromAddress: fromAddr,
        toAddress: toAddr,
      });

      // Persist tracking info to the order
      await db
        .update(orders)
        .set({
          trackingNumber: result.trackingNumber,
          trackingCarrier: result.carrier,
        })
        .where(eq(orders.id, orderId));

      console.info(
        `[shipping-label] Label generated for order ${orderId}: ${result.trackingNumber} (${result.carrier})`,
      );
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[shipping-label] Job ${job?.id} failed for order ${job?.data.orderId}:`,
      err.message,
    );
  });

  return worker;
}

// ── Helpers ──

/**
 * Extract a ShippingAddress from an order address snapshot (jsonb).
 * Falls back to a placeholder when the snapshot is missing — this should
 * not happen in normal flow but prevents hard crashes in edge cases.
 */
function buildAddress(
  snapshot: unknown,
  role: "buyer" | "seller",
): ShippingAddress {
  const s = snapshot as Record<string, unknown> | null | undefined;

  if (!s) {
    // Return a placeholder so the job fails gracefully with a clear error
    // rather than silently skipping.
    throw new Error(
      `[shipping-label] Missing ${role} address snapshot on order — cannot generate label`,
    );
  }

  return {
    name: (s["name"] as string | undefined) ?? (role === "buyer" ? "Buyer" : "Seller"),
    line1: (s["line1"] as string | undefined) ?? "",
    line2: s["line2"] as string | undefined,
    suburb: (s["suburb"] as string | undefined) ?? "",
    state: (s["state"] as string | undefined) ?? "",
    postcode: (s["postcode"] as string | undefined) ?? "",
    country: (s["country"] as string | undefined) ?? "AU",
    phone: s["phone"] as string | undefined,
  };
}

// Export queue name for use in tests
export { SHIPPING_LABEL_QUEUE };
