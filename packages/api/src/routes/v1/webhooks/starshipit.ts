import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { orders, payoutHolds, sellerProfiles } from "@bushpop/db/schema";
import rawBody from "fastify-raw-body";
import { evaluateHoldPolicy } from "../../../lib/payout-hold-service.js";
import { dispatchEvent } from "../../../lib/events.js";

const PROVIDER = "starshipit";

// ---------------------------------------------------------------------------
// Webhook payload shape (Starshipit tracking update)
// https://support.starshipit.com/hc/en-us/articles/360000726096
// ---------------------------------------------------------------------------

interface StarshipitTrackingEvent {
  /** The tracking number for this shipment */
  tracking_number?: string;
  /** Current status code */
  status?: string;
  /** Human readable status description */
  status_description?: string;
  /** Order reference — we set this to the orderId on label creation */
  order_number?: string;
  /** ISO timestamp of when this status was recorded */
  last_updated_date?: string;
}

interface StarshipitWebhookPayload {
  events?: StarshipitTrackingEvent[];
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

type StatusAction =
  | "dispatched"
  | "in_transit"
  | "delivered"
  | "exception"
  | "unknown";

function mapStarshipitStatus(status: string | undefined): StatusAction {
  if (!status) return "unknown";
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

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function starshipitWebhookRoutes(app: FastifyInstance) {
  // Register fastify-raw-body scoped to this plugin only.
  await app.register(rawBody, {
    global: false,
    encoding: "utf8",
    runFirst: true,
  });

  /**
   * POST /api/v1/webhooks/starshipit
   *
   * Security: HMAC-SHA256 signature verification using STARSHIPIT_WEBHOOK_SECRET.
   * Starshipit sends a `X-StarShipIT-Hmac-SHA256` header containing
   * base64(HMAC-SHA256(rawBody, webhookSecret)). Verification is ALWAYS
   * enforced — the secret is required at boot and a missing/invalid signature
   * is rejected with 401 (see below). There is no dev bypass.
   */
  app.post("/api/v1/webhooks/starshipit", {
    config: { rawBody: true, rateLimit: { max: 100, timeWindow: "1 minute" } },
    schema: {
      tags: ["Webhooks"],
      summary: "Starshipit tracking webhook receiver",
    },
  }, async (request, reply) => {
    const rawBodyStr = (request as unknown as { rawBody: string }).rawBody;

    if (!rawBodyStr) {
      return reply.status(400).send({ error: "Missing raw body" });
    }

    // ── HMAC verification (always enforced — secret is required at boot) ──
    const webhookSecret = process.env.STARSHIPIT_WEBHOOK_SECRET!;
    const sigHeader = request.headers["x-starshipit-hmac-sha256"];
    if (!sigHeader) {
      request.log.warn("[starshipit-webhook] Missing X-StarShipIT-Hmac-SHA256 header");
      return reply.status(401).send({ error: "Missing signature header" });
    }

    const sig = Array.isArray(sigHeader) ? sigHeader[0]! : sigHeader;
    const expected = createHmac("sha256", webhookSecret)
      .update(rawBodyStr, "utf8")
      .digest("base64");

    let sigValid = false;
    try {
      sigValid = timingSafeEqual(Buffer.from(sig, "base64"), Buffer.from(expected, "base64"));
    } catch {
      sigValid = false;
    }

    if (!sigValid) {
      request.log.warn("[starshipit-webhook] HMAC verification failed");
      return reply.status(401).send({ error: "Signature verification failed" });
    }

    // ── Parse payload ──
    let payload: StarshipitWebhookPayload;
    try {
      payload = JSON.parse(rawBodyStr) as StarshipitWebhookPayload;
    } catch {
      return reply.status(400).send({ error: "Invalid JSON payload" });
    }

    const events = payload.events ?? [];

    for (const event of events) {
      await handleTrackingEvent(event, request.log);
    }

    return reply.status(200).send({ received: true });
  });
}

// ---------------------------------------------------------------------------
// Event handler
// ---------------------------------------------------------------------------

async function handleTrackingEvent(
  event: StarshipitTrackingEvent,
  log: FastifyInstance["log"],
): Promise<void> {
  const { tracking_number, order_number, status, last_updated_date } = event;

  if (!tracking_number && !order_number) {
    log.warn("[starshipit-webhook] Event missing tracking_number and order_number — skipping");
    return;
  }

  // Look up order by orderId (order_number = orderId set on label creation)
  // Fall back to tracking_number lookup if order_number not set.
  let orderId: string | undefined;

  if (order_number) {
    orderId = order_number;
  } else if (tracking_number) {
    const [row] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.trackingNumber, tracking_number));
    orderId = row?.id;
  }

  if (!orderId) {
    log.warn(
      { tracking_number, order_number },
      "[starshipit-webhook] Could not resolve order — skipping",
    );
    return;
  }

  // ── Fetch current order row ──
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId));

  if (!order) {
    log.warn({ orderId }, "[starshipit-webhook] Order not found — skipping");
    return;
  }

  // ── Dedup check ──
  // Skip if this exact status + timestamp was already processed.
  if (
    status &&
    order.lastTrackingStatus === status &&
    last_updated_date &&
    order.lastTrackingEventAt !== null &&
    order.lastTrackingEventAt.toISOString() === new Date(last_updated_date).toISOString()
  ) {
    log.info(
      { orderId, status, last_updated_date },
      "[starshipit-webhook] Duplicate event — skipping",
    );
    return;
  }

  const action = mapStarshipitStatus(status);
  const now = new Date();
  const eventAt = last_updated_date ? new Date(last_updated_date) : now;

  switch (action) {
    case "dispatched": {
      // Carrier acceptance = shipment confirmed: paid → shipped.
      // Persist the tracking number when the order doesn't have one yet
      // (label created out-of-band, or the label worker crashed before its
      // own DB write) — never overwrite an existing value. The payload
      // carries no carrier field, so trackingCarrier is left as-is.
      const trackingNumberForOrder = order.trackingNumber ?? tracking_number ?? null;
      const result = await db
        .update(orders)
        .set({
          status: "shipped",
          trackingNumber: trackingNumberForOrder,
          lastTrackingStatus: status ?? null,
          lastTrackingEventAt: eventAt,
        })
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.status, "paid"),
          ),
        )
        .returning({ id: orders.id });

      if (result.length > 0) {
        log.info({ orderId, status }, "[starshipit-webhook] Order transitioned paid → shipped");
        // Drives the buyer's shipping_confirmation_buyer email via
        // event-consumer.ts's order.shipped handler — same event the label
        // worker and seller manual mark-shipped paths emit. Gated on the CAS
        // win, so it fires at most once per order even under webhook
        // redelivery (the other producers dispatch on their own CAS win).
        await dispatchEvent({
          eventName: "order.shipped",
          category: "order",
          actorId: "system",
          entityType: "order",
          entityId: orderId,
          channelId: order.channelId,
          metadata: {
            trackingNumber: trackingNumberForOrder,
            carrier: order.trackingCarrier ?? null,
          },
        }).catch((err: unknown) => {
          log.error({ orderId, err }, "[starshipit-webhook] Failed to dispatch order.shipped");
        });
      } else {
        // Order was not in paid status — update tracking fields only
        await db
          .update(orders)
          .set({ lastTrackingStatus: status ?? null, lastTrackingEventAt: eventAt })
          .where(eq(orders.id, orderId));
        log.info(
          { orderId, status, currentStatus: order.status },
          "[starshipit-webhook] Dispatched event — order not in paid state, tracking updated only",
        );
      }
      break;
    }

    case "in_transit": {
      // Update tracking status only — no order state transition
      await db
        .update(orders)
        .set({ lastTrackingStatus: status ?? null, lastTrackingEventAt: eventAt })
        .where(eq(orders.id, orderId));
      log.info({ orderId, status }, "[starshipit-webhook] Tracking status updated (in_transit)");
      break;
    }

    case "delivered": {
      // Transition shipped → delivered
      const deliveryResult = await db
        .update(orders)
        .set({
          status: "delivered",
          lastTrackingStatus: status ?? null,
          lastTrackingEventAt: eventAt,
          deliveryConfirmedAt: now,
        })
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.status, "shipped"),
          ),
        )
        .returning({ id: orders.id });

      if (deliveryResult.length === 0) {
        log.info(
          { orderId, currentStatus: order.status },
          "[starshipit-webhook] Delivered event — order not in shipped state, no-op",
        );
        break;
      }

      log.info({ orderId }, "[starshipit-webhook] Order transitioned shipped → delivered");

      // Update payout_holds: set deliveryConfirmedAt + evaluate hold policy
      const [payoutHold] = await db
        .select()
        .from(payoutHolds)
        .where(eq(payoutHolds.orderId, orderId))
        .limit(1);

      if (payoutHold) {
        // Set deliveryConfirmedAt on payout hold
        await db
          .update(payoutHolds)
          .set({ deliveryConfirmedAt: now })
          .where(eq(payoutHolds.id, payoutHold.id));

        // Look up seller profile for policy evaluation
        const [sellerProfile] = await db
          .select({ userId: sellerProfiles.userId, createdAt: sellerProfiles.createdAt })
          .from(sellerProfiles)
          .where(eq(sellerProfiles.userId, order.sellerId))
          .limit(1);

        if (sellerProfile) {
          try {
            // Re-fetch the updated order and hold for accurate policy evaluation
            const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
            const [updatedHold] = await db
              .select()
              .from(payoutHolds)
              .where(eq(payoutHolds.id, payoutHold.id));

            if (updatedOrder && updatedHold) {
              // Map Drizzle row to Order type for evaluateHoldPolicy
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

              log.info(
                { orderId, policyName: policyResult.policyName, releaseEligibleAt: policyResult.releaseEligibleAt },
                "[starshipit-webhook] Hold policy applied",
              );
            }
          } catch (err) {
            log.error(
              { orderId, err },
              "[starshipit-webhook] Failed to evaluate hold policy — skipping (non-fatal)",
            );
          }
        } else {
          log.warn({ orderId, sellerId: order.sellerId }, "[starshipit-webhook] Seller profile not found — hold policy not applied");
        }
      } else {
        log.warn({ orderId }, "[starshipit-webhook] No payout hold found for delivered order");
      }
      break;
    }

    case "exception": {
      // Update tracking status but do NOT transition order status
      // This blocks auto-complete by leaving status as-is
      await db
        .update(orders)
        .set({ lastTrackingStatus: status ?? null, lastTrackingEventAt: eventAt })
        .where(eq(orders.id, orderId));

      // Dispatch tracking exception event
      await dispatchEvent({
        eventName: "order.tracking_exception",
        category: "order",
        entityType: "order",
        entityId: orderId,
        metadata: {
          orderId,
          trackingNumber: tracking_number,
          status,
          statusDescription: event.status_description,
        },
      });

      log.warn(
        { orderId, tracking_number, status },
        "[starshipit-webhook] Tracking exception — event dispatched",
      );
      break;
    }

    case "unknown":
    default: {
      // Unknown status — update tracking field, log warning, no state transition
      await db
        .update(orders)
        .set({ lastTrackingStatus: status ?? null, lastTrackingEventAt: eventAt })
        .where(eq(orders.id, orderId));
      log.warn(
        { orderId, status },
        "[starshipit-webhook] Unknown tracking status — no state transition",
      );
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------

/**
 * @internal Test-only: invoke tracking event handler directly (bypasses HMAC check).
 */
export async function handleTrackingEventForTest(
  event: StarshipitTrackingEvent,
): Promise<void> {
  await handleTrackingEvent(event, console as unknown as FastifyInstance["log"]);
}
