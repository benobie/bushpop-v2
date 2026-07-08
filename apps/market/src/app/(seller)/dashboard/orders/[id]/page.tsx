import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { formatMoney } from "@/lib/format-money";
import { Badge } from "@bushpop/ui";
import { MarkShippedForm } from "@/components/seller/mark-shipped-form";
import { ConfirmPickupForm } from "@/components/seller/confirm-pickup-form";

const STATUS_LABELS: Record<string, string> = {
  paid: "Ready to ship",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  delivery_assumed: "Delivery assumed",
  shipment_stale_review: "Under review",
  refund_in_progress: "Refund in progress",
  refunded: "Refunded",
};

function getStatusVariant(status: string): "active" | "default" | "draft" | "sold" {
  switch (status) {
    case "paid":
      return "draft";
    case "shipped":
    case "delivered":
    case "completed":
      return "active";
    case "cancelled":
    case "refunded":
      return "sold";
    default:
      return "default";
  }
}

export default async function DashboardOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  const api = await createAuthedApiClient();
  const { data: order, error } = await api.GET("/api/v1/seller/orders/{id}", {
    params: { path: { id } },
  });

  if (error || !order) {
    notFound();
  }

  const shipTo = order.shippingAddressSnapshot;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/dashboard/orders" className="text-sm text-bp-ink-2 hover:underline">
        ← Orders
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-lg font-bold text-bp-ink">{order.id}</h1>
          <p className="mt-1 text-sm text-bp-ink-2">
            {new Date(order.createdAt).toLocaleString("en-AU")}
          </p>
        </div>
        <Badge variant={getStatusVariant(order.status)}>
          {STATUS_LABELS[order.status] ?? order.status}
        </Badge>
      </div>

      <section className="mt-6 rounded-xl border border-bp-line bg-white p-4">
        <h2 className="text-sm font-semibold text-bp-ink">Items</h2>
        <ul className="mt-2 divide-y divide-bp-line text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between py-2">
              <span className="font-mono text-xs text-bp-ink-2">{item.channelListingId}</span>
              <span>{formatMoney(item.priceCents, item.currency)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-bp-line bg-white p-4">
        <h2 className="text-sm font-semibold text-bp-ink">Payout</h2>
        <dl className="mt-2 space-y-1 text-sm">
          <Row label="Subtotal" value={formatMoney(order.subtotalCents, order.currency)} />
          <Row label="Shipping" value={formatMoney(order.shippingCents, order.currency)} />
          <Row label="Platform fee" value={`-${formatMoney(order.platformFeeCents, order.currency)}`} />
          <Row
            label="Your payout"
            value={formatMoney(order.sellerProceedsCents, order.currency)}
            emphasis
          />
        </dl>
      </section>

      <section className="mt-6 rounded-xl border border-bp-line bg-white p-4">
        <h2 className="text-sm font-semibold text-bp-ink">Ship to</h2>
        {shipTo ? (
          <address className="mt-2 space-y-0.5 text-sm not-italic text-bp-ink-2">
            <p>{shipTo.line1}</p>
            {shipTo.line2 && <p>{shipTo.line2}</p>}
            <p>
              {shipTo.suburb} {shipTo.state} {shipTo.postcode}
            </p>
            <p>{shipTo.country}</p>
          </address>
        ) : (
          <p className="mt-2 text-sm text-bp-ink-2">No shipping address on file (pickup order).</p>
        )}
      </section>

      {shipTo ? (
        <section className="mt-6 rounded-xl border border-bp-line bg-white p-4">
          <h2 className="text-sm font-semibold text-bp-ink">Tracking</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <Row label="Carrier" value={order.trackingCarrier ?? "—"} />
            <Row label="Tracking number" value={order.trackingNumber ?? "—"} />
          </dl>
          {order.shippingLabelUrl && (
            <a
              href={order.shippingLabelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-medium text-bp-ink-2 hover:underline"
            >
              Download shipping label →
            </a>
          )}
          <div className="mt-4">
            <MarkShippedForm orderId={order.id} status={order.status} />
          </div>
        </section>
      ) : (
        <section className="mt-6 rounded-xl border border-bp-line bg-white p-4">
          <h2 className="text-sm font-semibold text-bp-ink">Pickup</h2>
          <p className="mt-2 text-sm text-bp-ink-2">
            This is a pickup order. Arrange a handover with the buyer, then confirm using the
            collection code they show you.
          </p>
          <div className="mt-4">
            <ConfirmPickupForm orderId={order.id} status={order.status} />
          </div>
        </section>
      )}
    </main>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-bp-ink-2">{label}</dt>
      <dd className={emphasis ? "font-semibold text-bp-ink" : ""}>{value}</dd>
    </div>
  );
}

export const metadata = { title: "Order — Dashboard" };
