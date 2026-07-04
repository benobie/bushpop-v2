import { Queue, Worker, type Job } from "bullmq";
import { aliasedTable, and, eq, sql } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { channelListings, channels, notifications, orderItems, orders, user } from "@bushpop/db/schema";
import { DEFAULT_CHANNEL, getChannelConfig } from "@bushpop/config";
import {
  getEmailSender,
  orderConfirmationBuyerTemplate,
  orderNotificationSellerTemplate,
  listingPublishedSellerTemplate,
  reportActionedTemplate,
  reportReinstatedTemplate,
  scoreNudgeTemplate,
  shippingConfirmationBuyerTemplate,
  trackingExceptionAdminTemplate,
} from "../lib/email/index.js";
import { getRedis } from "../lib/redis.js";

const EMAIL_QUEUE = "email";

let emailQueue: Queue | null = null;

function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue(EMAIL_QUEUE, {
      connection: getRedis(),
    });
  }

  return emailQueue;
}

export type EmailJobType =
  | "order_confirmation_buyer"
  | "order_notification_seller"
  | "shipping_confirmation_buyer"
  | "tracking_exception_admin"
  | "score_nudge"
  | "report_actioned"
  | "report_reinstated"
  | "listing_published_seller";

export interface EmailJobData {
  type: EmailJobType;
  orderId: string;
  notificationId?: string;
  notificationLeaseHeld?: boolean;
}

export interface FailedEmailJob {
  jobId: string;
  type: EmailJobType;
  orderId: string;
  failedReason: string | undefined;
  attemptsMade: number;
}

/**
 * Surfaces the email queue's dead-lettered jobs — those that exhausted all
 * retry attempts. This is the "is the DLQ empty?" check for the G5
 * support-readiness smoke: a failed send must be queryable here, never
 * silently dropped. BullMQ keeps the most recent `removeOnFail` count
 * (currently 3) of these per queue.
 */
export async function getFailedEmailJobs(): Promise<FailedEmailJob[]> {
  const queue = getEmailQueue();
  const jobs = await queue.getFailed();

  return jobs.map((job) => ({
    jobId: job.id ?? "",
    type: job.data.type,
    orderId: job.data.orderId,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
  }));
}

export async function enqueueEmail(data: EmailJobData): Promise<void> {
  const queue = getEmailQueue();
  const jobId = data.notificationId ?? `${data.type}-${data.orderId}`;

  await queue.add("send-email", data satisfies EmailJobData, {
    jobId,
    removeOnComplete: true,
    removeOnFail: 3,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  });
}

const buyerAlias = aliasedTable(user, "buyer");
const sellerAlias = aliasedTable(user, "seller");

interface OrderWithParties {
  id: string;
  status: string;
  buyerId: string;
  sellerId: string;
  totalCents: number;
  sellerProceedsCents: number;
  currency: string;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  shippingAddressSnapshot: unknown;
  buyerEmail: string;
  buyerName: string;
  sellerEmail: string;
  sellerName: string;
  channelName: string;
}

interface NotificationContext {
  recipientEmail: string;
  payload: Record<string, unknown>;
}

interface OrderItem {
  title: string;
  priceCents: number;
}

async function fetchOrderWithParties(orderId: string): Promise<OrderWithParties | null> {
  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      buyerId: orders.buyerId,
      sellerId: orders.sellerId,
      totalCents: orders.totalCents,
      sellerProceedsCents: orders.sellerProceedsCents,
      currency: orders.currency,
      trackingNumber: orders.trackingNumber,
      trackingCarrier: orders.trackingCarrier,
      shippingAddressSnapshot: orders.shippingAddressSnapshot,
      buyerEmail: buyerAlias.email,
      buyerName: buyerAlias.name,
      sellerEmail: sellerAlias.email,
      sellerName: sellerAlias.name,
      channelName: channels.name,
    })
    .from(orders)
    .innerJoin(buyerAlias, eq(buyerAlias.id, orders.buyerId))
    .innerJoin(sellerAlias, eq(sellerAlias.id, orders.sellerId))
    .innerJoin(channels, eq(channels.id, orders.channelId))
    .where(eq(orders.id, orderId));

  return rows[0] ?? null;
}

async function fetchOrderItems(orderId: string): Promise<OrderItem[]> {
  return db
    .select({
      title: channelListings.title,
      priceCents: orderItems.priceCents,
    })
    .from(orderItems)
    .innerJoin(channelListings, eq(channelListings.id, orderItems.channelListingId))
    .where(eq(orderItems.orderId, orderId));
}

async function fetchNotificationContext(notificationId: string): Promise<NotificationContext | null> {
  const rows = await db
    .select({
      recipientEmail: user.email,
      payload: notifications.payload,
    })
    .from(notifications)
    .innerJoin(user, eq(user.id, notifications.userId))
    .where(eq(notifications.id, notificationId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    recipientEmail: row.recipientEmail,
    payload: row.payload as Record<string, unknown>,
  };
}

async function claimNotification(notificationId: string, leaseHeld: boolean): Promise<boolean> {
  if (leaseHeld) {
    const rows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.status, "sending"),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }

  const rows = await db
    .update(notifications)
    .set({
      status: "sending",
      sendingAt: new Date(),
    })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.status, "pending"),
      ),
    )
    .returning({ id: notifications.id });

  return rows.length > 0;
}

async function markNotificationSent(notificationId: string, providerMessageId?: string): Promise<void> {
  await db
    .update(notifications)
    .set({
      status: "sent",
      sentAt: new Date(),
      providerMessageId,
      lastError: null,
    })
    .where(eq(notifications.id, notificationId));
}

async function markNotificationFailed(notificationId: string, error: string): Promise<void> {
  await db
    .update(notifications)
    .set({
      status: "failed",
      failedAt: new Date(),
      attemptCount: sql`${notifications.attemptCount} + 1`,
      lastError: error,
    })
    .where(eq(notifications.id, notificationId));
}

async function processNotificationEmail(job: Job<EmailJobData>): Promise<void> {
  const { type, orderId: entityId, notificationId } = job.data;
  const send = getEmailSender();

  let recipientEmail = "noreply@bushpop.com.au";
  let payload: Record<string, unknown> = { entityId };

  if (notificationId) {
    const notificationContext = await fetchNotificationContext(notificationId);
    if (!notificationContext) {
      throw new Error(`[email] Notification ${notificationId} not found`);
    }

    recipientEmail = notificationContext.recipientEmail;
    payload = notificationContext.payload;
  }

  // No request or order context available in this background worker path —
  // fall back to the process-level channel config.
  const channelConfig = getChannelConfig(process.env.CHANNEL_SLUG ?? DEFAULT_CHANNEL);
  const channelName = channelConfig.name;

  const template =
    type === "score_nudge"
      ? scoreNudgeTemplate({
          entityId,
          nudgeKey: typeof payload["nudgeKey"] === "string" ? payload["nudgeKey"] : undefined,
          channelName,
        })
      : type === "listing_published_seller"
        ? listingPublishedSellerTemplate({
            listingTitle:
              typeof payload["listingTitle"] === "string" ? payload["listingTitle"] : "Your item",
            handle: typeof payload["handle"] === "string" ? payload["handle"] : "",
            listingUrl:
              typeof payload["handle"] === "string" && payload["handle"] && channelConfig.domain
                ? `https://${channelConfig.domain}/products/${payload["handle"]}`
                : null,
            strengthScore:
              typeof payload["strengthScore"] === "number" ? payload["strengthScore"] : null,
            channelName,
          })
        : type === "report_actioned"
          ? reportActionedTemplate({ entityId, channelName })
          : reportReinstatedTemplate({ entityId, channelName });

  const result = await send({
    to: recipientEmail,
    subject: template.subject,
    text: template.text,
    headers: notificationId ? { "Idempotency-Key": notificationId } : undefined,
  });

  if (notificationId) {
    await markNotificationSent(notificationId, result.providerMessageId);
  }

  console.info(`[email] Sent ${type} for entity ${entityId}`);
}

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { type, orderId, notificationId, notificationLeaseHeld = false } = job.data;

  if (notificationId) {
    const claimed = await claimNotification(notificationId, notificationLeaseHeld);
    if (!claimed) {
      console.info(`[email] Notification ${notificationId} already claimed or terminal — skipping`);
      return;
    }
  }

  try {
    if (
      type === "score_nudge" ||
      type === "report_actioned" ||
      type === "report_reinstated" ||
      type === "listing_published_seller"
    ) {
      await processNotificationEmail(job);
      return;
    }

    console.info(`[email] Processing ${type} for order ${orderId}`);

    const order = await fetchOrderWithParties(orderId);
    if (!order) {
      throw new Error(`[email] Order ${orderId} not found`);
    }

    if (order.status === "cancelled") {
      return;
    }

    const send = getEmailSender();
    const items = await fetchOrderItems(orderId);

    if (type === "order_confirmation_buyer") {
      const { subject, text } = orderConfirmationBuyerTemplate({
        orderId,
        buyerName: order.buyerName,
        totalCents: order.totalCents,
        currency: order.currency,
        items,
        channelName: order.channelName,
      });

      const result = await send({
        to: order.buyerEmail,
        subject,
        text,
        headers: notificationId ? { "Idempotency-Key": notificationId } : undefined,
      });

      if (notificationId) {
        await markNotificationSent(notificationId, result.providerMessageId);
      }
    } else if (type === "order_notification_seller") {
      const snap = order.shippingAddressSnapshot as Record<string, string> | null;
      const { subject, text } = orderNotificationSellerTemplate({
        orderId,
        sellerName: order.sellerName,
        totalCents: order.sellerProceedsCents,
        currency: order.currency,
        items,
        shippingName: snap?.["name"] ?? "Buyer",
        shippingLine1: snap?.["line1"] ?? "",
        shippingSuburb: snap?.["suburb"] ?? "",
        shippingState: snap?.["state"] ?? "",
        shippingPostcode: snap?.["postcode"] ?? "",
        channelName: order.channelName,
      });

      const result = await send({
        to: order.sellerEmail,
        subject,
        text,
        headers: notificationId ? { "Idempotency-Key": notificationId } : undefined,
      });

      if (notificationId) {
        await markNotificationSent(notificationId, result.providerMessageId);
      }
    } else if (type === "shipping_confirmation_buyer") {
      if (!order.trackingNumber || !order.trackingCarrier) {
        throw new Error(`[email] Order ${orderId} has no tracking info`);
      }

      const { subject, text } = shippingConfirmationBuyerTemplate({
        orderId,
        buyerName: order.buyerName,
        trackingNumber: order.trackingNumber,
        trackingCarrier: order.trackingCarrier,
        channelName: order.channelName,
      });

      const result = await send({
        to: order.buyerEmail,
        subject,
        text,
        headers: notificationId ? { "Idempotency-Key": notificationId } : undefined,
      });

      if (notificationId) {
        await markNotificationSent(notificationId, result.providerMessageId);
      }
    } else if (type === "tracking_exception_admin") {
      const adminEmail = process.env.ADMIN_EMAIL ?? "admin@bushpop.com.au";
      const { subject, text } = trackingExceptionAdminTemplate({
        orderId,
        trackingNumber: order.trackingNumber,
        lastTrackingStatus: order.status,
        channelName: order.channelName,
      });

      const result = await send({
        to: adminEmail,
        subject,
        text,
        headers: notificationId ? { "Idempotency-Key": notificationId } : undefined,
      });

      if (notificationId) {
        await markNotificationSent(notificationId, result.providerMessageId);
      }
    } else {
      throw new Error(`[email] Unknown email type: ${type as string}`);
    }

    console.info(`[email] Sent ${type} for order ${orderId}`);
  } catch (error) {
    if (notificationId) {
      await markNotificationFailed(notificationId, error instanceof Error ? error.message : String(error));
    }

    throw error;
  }
}

export function startEmailWorker(): Worker {
  const connection = getRedis();

  const worker = new Worker<EmailJobData>(EMAIL_QUEUE, processEmailJob, {
    connection,
    concurrency: 1,
    limiter: {
      max: 2,
      duration: 1_000,
    },
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[email] Job ${job?.id} failed (${job?.data?.type} for order ${job?.data?.orderId}):`,
      err.message,
    );
  });

  return worker;
}

export { EMAIL_QUEUE };

export const EMAIL_RATE_LIMIT = {
  max: 2,
  duration: 1_000,
} as const;

export async function processEmailJobForTest(data: EmailJobData): Promise<void> {
  return processEmailJob({ data } as Job<EmailJobData>);
}
