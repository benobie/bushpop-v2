"use client";

/**
 * OrderPoller — polls GET /store/orders until the order matching the
 * checkout session ID appears (webhook-created, async).
 *
 * Strategy: poll every 2s, up to 15 tries (~30s).
 * Timeout fallback: show success message + link to /orders (never error on redirect_status=succeeded).
 */
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { OrderSummary } from "@/components/order/order-summary";
import { Button, Banner, Tlink, CheckIcon, LockIcon, ShieldIcon } from "@bushpop/ui";
import { track } from "@/lib/analytics";
import { DEFAULT_CHANNEL } from "@bushpop/config";

interface OrderPollerProps {
  /** The sessionId from the checkout session, passed via confirmation page searchParams */
  sessionId: string;
  /** BF-08 guest commerce — true when the buyer checked out anonymously. */
  isGuest?: boolean;
  /** The guest's checkout email — prefilled into the post-purchase sign-up link. */
  guestEmail?: string;
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
  title: string | null;
  coverImage: string | null;
  handle: string | null;
  size: string | null;
  condition: string | null;
  brand: string | null;
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
  buyerProtectionFeeCents: number;
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

export function OrderPoller({ sessionId, isGuest, guestEmail }: OrderPollerProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const firedOrderConfirmedRef = useRef(false);

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
        if (!firedOrderConfirmedRef.current) {
          firedOrderConfirmedRef.current = true;
          track({ event: "order.confirmed", props: { channel: DEFAULT_CHANNEL, order_id: found.id } });
        }
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

  // Found the order — "It's yours." celebratory pattern (design/home/order-confirmation.html)
  if (order) {
    const orderRef = order.id.slice(-6).toUpperCase();
    return (
      <div data-testid="order-confirmed" className="mx-auto max-w-[640px]">
        <div className="py-6 text-center sm:py-10">
          <div
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]"
            style={{
              background:
                "linear-gradient(180deg, var(--color-bp-cta-top), var(--color-bp-cta-bot))",
            }}
          >
            <CheckIcon size={28} />
          </div>
          <h1 className="font-[family-name:var(--font-bp-head)] text-[clamp(30px,4vw,42px)] font-extrabold leading-[1.05] tracking-tight text-[var(--color-bp-ink)]">
            It&rsquo;s yours.
          </h1>
          <p className="mt-2.5 text-[15px] text-[var(--color-bp-ink-2)]" data-testid="order-reference">
            {`Order #${orderRef} confirmed — nice find.`}
          </p>
        </div>

        <div data-testid="order-summary-card">
          <OrderSummary
            status={order.status}
            subtotalCents={order.subtotalCents}
            shippingCents={order.shippingCents}
            buyerProtectionFeeCents={order.buyerProtectionFeeCents}
            totalCents={order.totalCents}
            currency={order.currency}
            items={order.items}
            shippingAddressSnapshot={order.shippingAddressSnapshot}
            createdAt={order.createdAt}
          />
        </div>

        {/* What happens next */}
        <div className="mt-9">
          <h2 className="mb-4 font-[family-name:var(--font-bp-head)] text-xl font-extrabold tracking-tight text-[var(--color-bp-ink)]">
            What happens next
          </h2>
          {[
            {
              title: "The seller packs it up",
              body: "Most post within a couple of days.",
            },
            {
              title: "Tracking lands in your email",
              body: "The moment it ships, you'll get the tracking number.",
            },
            {
              title: "Track it to your door",
              body: "Follow it the whole way home.",
            },
          ].map((step, i) => (
            <div key={step.title} className="flex gap-3.5 py-2.5">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-[var(--color-bp-line)] bg-[var(--color-bp-surface-2)] font-[family-name:var(--font-bp-head)] text-[13px] font-bold text-[var(--color-bp-green-bright)]">
                {i + 1}
              </span>
              <div>
                <h4 className="text-sm font-bold text-[var(--color-bp-ink)]">{step.title}</h4>
                <p className="mt-0.5 text-[13.5px] text-[var(--color-bp-ink-2)]">{step.body}</p>
              </div>
            </div>
          ))}
          <div className="mt-3.5 flex items-start gap-2.5 rounded-[var(--radius-bp-rect)] border border-[var(--color-bp-line)] bg-[var(--color-bp-surface-2)] px-4 py-3.5 text-[13.5px] text-[var(--color-bp-ink)]">
            <LockIcon size={18} className="mt-0.5 flex-shrink-0 text-[var(--color-bp-green-bright)]" />
            <span>
              Your payment sits safely with us until it&rsquo;s delivered &mdash; that&rsquo;s how
              sellers get paid.
            </span>
          </div>
        </div>

        {/* Buyer protection */}
        <div className="mt-[26px] flex items-start gap-3 rounded-[var(--radius-bp-rect)] border border-[var(--color-bp-line)] px-[18px] py-4">
          <ShieldIcon size={24} className="mt-0.5 flex-shrink-0 text-[var(--color-bp-green-bright)]" />
          <div>
            <h3 className="text-[14.5px] font-bold text-[var(--color-bp-ink)]">
              Buyer protection on every order
            </h3>
            <p className="mt-0.5 text-[13.5px] text-[var(--color-bp-ink-2)]">
              If your order doesn&rsquo;t arrive or isn&rsquo;t as described, you&rsquo;re covered.
            </p>
          </div>
        </div>

        {isGuest && (
          <div
            className="mt-7 flex items-start gap-3 rounded-[var(--radius-bp-rect)] border border-[var(--color-bp-line)] bg-[var(--color-bp-surface-2)] px-[18px] py-4"
            data-testid="guest-signup-prompt"
          >
            <div>
              <h3 className="text-[14.5px] font-bold text-[var(--color-bp-ink)]">
                Save this order to your account
              </h3>
              <p className="mt-0.5 text-[13.5px] text-[var(--color-bp-ink-2)]">
                Create an account with this email to track every order in one place — takes a
                few seconds.
              </p>
              <Link
                href={`/sign-up?next=${encodeURIComponent("/orders")}${guestEmail ? `&email=${encodeURIComponent(guestEmail)}` : ""}`}
                className="mt-2 inline-block text-[13.5px] font-bold text-[var(--color-bp-green-bright)] underline"
              >
                Create an account
              </Link>
            </div>
          </div>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="primary" size="lg" className="flex-1">
            <Link href="/orders">Track my order</Link>
          </Button>
          <Button asChild variant="ghost" size="lg" className="flex-1" data-testid="view-all-orders-button">
            <Link href="/shop">Keep shopping</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Timed out — payment was definitely successful, order is just processing
  if (timedOut) {
    return (
      <div className="space-y-6" data-testid="order-processing-fallback">
        <Banner variant="success" title="Payment successful!">
          Your order is being finalised. This usually takes a few seconds.
        </Banner>

        <Banner variant="neutral">
          <p>
            Your order will appear in{" "}
            <Tlink asChild>
              <Link href="/orders">My Orders</Link>
            </Tlink>{" "}
            once processing is complete. You can close this page safely.
          </p>
        </Banner>

        <Button asChild variant="primary" className="w-full">
          <Link href="/orders">Check my orders</Link>
        </Button>
      </div>
    );
  }

  // Still polling
  return (
    <div className="flex flex-col items-center gap-4 py-12" data-testid="order-polling-status">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-bp-line-2)] border-t-[var(--color-bp-green-ink)]" />
      <p className="text-sm text-[var(--color-bp-ink-2)]">
        Confirming your order… ({pollCount}/{MAX_POLLS})
      </p>
    </div>
  );
}
