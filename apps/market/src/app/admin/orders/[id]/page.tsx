import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { formatMoney } from "@/lib/format-money";
import { RefundButton } from "@/components/admin/refund-button";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const api = await createAuthedApiClient();
  const { data: order, error } = await api.GET("/api/v1/admin/orders/{id}", {
    params: { path: { id } },
  });

  if (error || !order) {
    notFound();
  }

  return (
    <div>
      <Link href="/admin/orders" className="text-sm text-bp-ink-2 hover:underline">
        ← Orders
      </Link>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-xl font-bold text-bp-ink">{order.id}</h1>
          <p className="mt-1 text-sm text-bp-ink-2">
            Status <span className="font-medium text-bp-ink">{order.status}</span> · created{" "}
            {new Date(order.createdAt).toLocaleString("en-AU")}
          </p>
        </div>
        <RefundButton orderId={order.id} status={order.status} />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-bp-line p-4">
          <h2 className="text-sm font-semibold text-bp-ink">Parties</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div>
              <dt className="inline text-bp-ink-2">Buyer: </dt>
              <dd className="inline">
                {order.buyer ? `${order.buyer.name} (${order.buyer.email})` : order.buyerId}
              </dd>
            </div>
            <div>
              <dt className="inline text-bp-ink-2">Seller: </dt>
              <dd className="inline">
                {order.seller ? `${order.seller.name} (${order.seller.email})` : order.sellerId}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-bp-line p-4">
          <h2 className="text-sm font-semibold text-bp-ink">Payment</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <Row label="Subtotal" value={formatMoney(order.subtotalCents, order.currency)} />
            <Row label="Shipping" value={formatMoney(order.shippingCents, order.currency)} />
            <Row label="Platform fee" value={formatMoney(order.platformFeeCents, order.currency)} />
            <Row
              label="Buyer protection fee"
              value={formatMoney(order.buyerProtectionFeeCents, order.currency)}
            />
            <Row label="Seller proceeds" value={formatMoney(order.sellerProceedsCents, order.currency)} />
            <Row label="Total" value={formatMoney(order.totalCents, order.currency)} />
            <Row label="Stripe PI" value={order.stripePaymentIntentId ?? "—"} mono />
            <Row label="Stripe transfer" value={order.stripeTransferId ?? "—"} mono />
          </dl>
        </section>

        <section className="rounded-lg border border-bp-line p-4">
          <h2 className="text-sm font-semibold text-bp-ink">Shipping</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <Row label="Tracking number" value={order.trackingNumber ?? "—"} />
            <Row label="Carrier" value={order.trackingCarrier ?? "—"} />
            <Row label="Last status" value={order.lastTrackingStatus ?? "—"} />
            <Row
              label="Delivery confirmed"
              value={
                order.deliveryConfirmedAt
                  ? new Date(order.deliveryConfirmedAt).toLocaleString("en-AU")
                  : "—"
              }
            />
          </dl>
        </section>

        <section className="rounded-lg border border-bp-line p-4">
          <h2 className="text-sm font-semibold text-bp-ink">Payout hold</h2>
          {order.payoutHold ? (
            <dl className="mt-2 space-y-1 text-sm">
              <Row label="Status" value={order.payoutHold.status} />
              <Row label="Amount" value={formatMoney(order.payoutHold.amountCents, order.currency)} />
              <Row label="Transfer" value={order.payoutHold.transferId ?? "—"} mono />
              <Row label="Release attempts" value={String(order.payoutHold.releaseAttempts)} />
              {order.payoutHold.failureReason && (
                <Row label="Failure reason" value={order.payoutHold.failureReason} />
              )}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-bp-ink-2">No payout hold on this order.</p>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-bp-line p-4">
        <h2 className="text-sm font-semibold text-bp-ink">Items</h2>
        <ul className="mt-2 divide-y divide-bp-line text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between py-2">
              <span>{item.title ?? item.channelListingId}</span>
              <span>{formatMoney(item.priceCents, order.currency)}</span>
            </li>
          ))}
        </ul>
      </section>

      {order.refunds.length > 0 && (
        <section className="mt-6 rounded-lg border border-bp-line p-4">
          <h2 className="text-sm font-semibold text-bp-ink">Refunds</h2>
          <ul className="mt-2 divide-y divide-bp-line text-sm">
            {order.refunds.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex justify-between">
                  <span>{r.status}</span>
                  <span>{formatMoney(r.amountCents, order.currency)}</span>
                </div>
                <p className="text-xs text-bp-ink-2">
                  {r.reason ?? "no reason given"} · {new Date(r.createdAt).toLocaleString("en-AU")}
                  {r.stripeRefundId ? ` · ${r.stripeRefundId}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-lg border border-bp-line p-4">
        <h2 className="text-sm font-semibold text-bp-ink">Event timeline (audit trail)</h2>
        <p className="mt-1 text-xs text-bp-ink-2">
          From <code>marketplace_events</code> — every admin action on this order is appended here.
        </p>
        <ul className="mt-2 divide-y divide-bp-line text-sm">
          {order.events.length === 0 && (
            <li className="py-2 text-bp-ink-2">No events recorded for this order.</li>
          )}
          {order.events.map((event) => (
            <li key={event.id} className="py-2">
              <div className="flex justify-between">
                <span className="font-medium">{event.eventName}</span>
                <span className="text-xs text-bp-ink-2">
                  {new Date(event.createdAt).toLocaleString("en-AU")}
                </span>
              </div>
              {event.metadata ? (
                <pre className="mt-1 overflow-x-auto rounded bg-bp-surface-2 p-2 text-xs">
                  {JSON.stringify(event.metadata, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-bp-ink-2">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : ""}>{value}</dd>
    </div>
  );
}

export const metadata = { title: "Order — Admin" };
