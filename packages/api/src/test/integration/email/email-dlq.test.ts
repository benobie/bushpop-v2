/**
 * Email dead-letter visibility — B5 item 5.
 *
 * Runbook §4.1 requires that a deliberate bad-address send "lands in the DLQ
 * and is visible, not silent". This drives a real job through a real BullMQ
 * worker (not the mocked-queue unit tests used elsewhere in this suite) so
 * the exhausted-retries path is genuine, then asserts getFailedEmailJobs()
 * surfaces it.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Queue } from "bullmq";
import { ulid } from "ulid";
import { db } from "@bushpop/db/client";
import { orders, checkoutSessions, carts } from "@bushpop/db/schema";
import { getRedis } from "../../../lib/redis.js";
import { getSentEmails, clearMockEmails, setMockEmailError, _resetEmailSender } from "../../../lib/email/index.js";
import { createTestUser } from "../../helpers/create-user.js";
import { getBushpopChannel } from "../../helpers/get-channel.js";
import { EMAIL_QUEUE, getFailedEmailJobs, startEmailWorker, type EmailJobData } from "../../../workers/email.js";

async function createMinimalOrder() {
  const channel = await getBushpopChannel();
  const buyer = await createTestUser();
  const seller = await createTestUser();

  const [cart] = await db.insert(carts).values({ id: ulid(), buyerId: buyer.id, channelId: channel.id }).returning();

  const [csRow] = await db
    .insert(checkoutSessions)
    .values({
      id: ulid(),
      cartId: cart!.id,
      buyerId: buyer.id,
      channelId: channel.id,
      status: "succeeded",
      subtotalCents: 5000,
      shippingCents: 800,
      platformFeeCents: 200,
      sellerProceedsCents: 4600,
      totalCents: 6000,
      currency: "AUD",
    })
    .returning();

  const [order] = await db
    .insert(orders)
    .values({
      id: ulid(),
      checkoutSessionId: csRow!.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      channelId: channel.id,
      status: "paid",
      subtotalCents: 5000,
      shippingCents: 800,
      platformFeeCents: 200,
      sellerProceedsCents: 4600,
      totalCents: 6000,
      currency: "AUD",
      shippingAddressSnapshot: { name: "Jane Buyer", line1: "1 Buyer St", suburb: "Sydney", state: "NSW", postcode: "2000", country: "AU" },
      senderAddressSnapshot: { name: "John Seller", line1: "100 Seller Rd", suburb: "Melbourne", state: "VIC", postcode: "3000", country: "AU" },
    })
    .returning();

  return order!;
}

describe("Email dead-letter visibility (real BullMQ)", () => {
  let worker: Awaited<ReturnType<typeof startEmailWorker>> | null = null;

  beforeEach(() => {
    clearMockEmails();
    delete process.env.RESEND_API_KEY;
    _resetEmailSender();
  });

  afterEach(async () => {
    if (worker) {
      await worker.close();
      worker = null;
    }
    clearMockEmails();
    _resetEmailSender();
  });

  it("a permanently-failing send is queryable via getFailedEmailJobs — not silently dropped", async () => {
    const order = await createMinimalOrder();

    // Simulate the provider rejecting a bad recipient address on every attempt.
    setMockEmailError("Invalid recipient address — bounced");

    const queue = new Queue<EmailJobData>(EMAIL_QUEUE, { connection: getRedis() });
    const jobId = `dlq-test-${order.id}`;

    worker = startEmailWorker();

    const failedEvent = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for job to fail")), 10_000);
      worker!.on("failed", (job) => {
        if (job?.id === jobId) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    await queue.add(
      "send-email",
      { type: "order_confirmation_buyer", orderId: order.id } satisfies EmailJobData,
      {
        jobId,
        // Single attempt so the job dead-letters immediately — production
        // uses attempts:3 with exponential backoff (see enqueueEmail); this
        // just needs the terminal exhausted-retries state, fast.
        attempts: 1,
        removeOnFail: 3,
      },
    );

    await failedEvent;
    await queue.close();

    const failed = await getFailedEmailJobs();
    const ours = failed.find((j) => j.jobId === jobId);

    expect(ours).toBeDefined();
    expect(ours!.type).toBe("order_confirmation_buyer");
    expect(ours!.orderId).toBe(order.id);
    expect(ours!.failedReason).toMatch(/Invalid recipient address/);

    // Confirm it never silently "succeeded" — no email actually sent.
    expect(getSentEmails()).toHaveLength(0);
  }, 15_000);
});
