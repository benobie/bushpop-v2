"use client";

/**
 * OrderPoller — polls GET /store/orders until the order matching the
 * checkout session ID appears (webhook-created, async).
 *
 * Strategy: poll every 2s, up to 15 tries (~30s).
 * Timeout fallback: show success message + link to /orders (never error on redirect_status=succeeded).
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { OrderSummary } from "@/components/order/order-summary";
import { Button } from "@bushpop/ui";

interface OrderPollerProps {
  /** The sessionId from the checkout session, passed via confirmation page searchParams */
  sessionId: string;
}

type OrderStatus =
  | "paid"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "delivery_assumed"
  | "shipment_stale_review"
  | "refund_in_progress"
  | "refunded";

interface OrderItem {
  id: string;
  orderId: string;
  channelListingId: string;
  priceCents: number;
  currency: string;
  createdAt: string;
}

interface ShippingAddress {
  line1: string;
  line2?: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
}

interface Order {
  id: string;
  checkoutSessionId: string;
  buyerId: string;
  sellerId: string;
  channelId: string;
  status: OrderStatus;
  subtotalCents: number;
  shippingCents: number;
  platformFeeCents: number;
  sellerProceedsCents: number;
  totalCents: number;
  currency: string;
  shippingAddressSnapshot: ShippingAddress | null;
  senderAddressSnapshot: ShippingAddress | null;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  stripePaymentIntentId: string | null;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

const MAX_POLLS = 15;
const POLL_INTERVAL_MS = 2000;

export function OrderPoller({ sessionId }: OrderPollerProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  const poll = useCallback(async (): Promise<Order | null> => {
    const api = createBrowserApiClient();
    const { data } = await api.GET("/api/v1/store/orders");
    if (!data) return null;

    const match = data.items.find(
      (o) => o.checkoutSessionId === sessionId,
    );
    return match ?? null;
  }, [sessionId]);

  useEffect(() => {
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function run() {
      attempts++;
      setPollCount(attempts);

      const found = await poll();
      if (found) {
        setOrder(found as Order);
        return;
      }

      if (attempts >= MAX_POLLS) {
        setTimedOut(true);
        return;
      }

      timer = setTimeout(run, POLL_INTERVAL_MS);
    }

    timer = setTimeout(run, 500); // small initial delay
    return () => clearTimeout(timer);
  }, [poll]);

  // Found the order — show summary
  if (order) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl bg-green-50 px-4 py-4">
          <p className="font-semibold text-green-800">Order confirmed!</p>
          <p className="mt-1 text-sm text-green-700">
            Your payment was successful. Details below.
          </p>
        </div>

        <OrderSummary
          status={order.status}
          subtotalCents={order.subtotalCents}
          shippingCents={order.shippingCents}
          platformFeeCents={order.platformFeeCents}
          totalCents={order.totalCents}
          currency={order.currency}
          items={order.items}
          shippingAddressSnapshot={order.shippingAddressSnapshot}
          createdAt={order.createdAt}
        />

        <Button asChild variant="outline" className="w-full">
          <Link href="/orders">View all orders</Link>
        </Button>
      </div>
    );
  }

  // Timed out — payment was definitely successful, order is just processing
  if (timedOut) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl bg-green-50 px-4 py-4">
          <p className="font-semibold text-green-800">Payment successful!</p>
          <p className="mt-1 text-sm text-green-700">
            Your order is being finalised. This usually takes a few seconds.
          </p>
        </div>

        <div className="rounded-xl border border-brand-200 px-4 py-4 text-sm text-brand-600">
          <p>
            Your order will appear in{" "}
            <Link href="/orders" className="underline hover:text-brand-800">
              My Orders
            </Link>{" "}
            once processing is complete. You can close this page safely.
          </p>
        </div>

        <Button asChild variant="primary" className="w-full">
          <Link href="/orders">Check my orders</Link>
        </Button>
      </div>
    );
  }

  // Still polling
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" />
      <p className="text-sm text-brand-500">
        Confirming your order… ({pollCount}/{MAX_POLLS})
      </p>
    </div>
  );
}
