/**
 * Shared order summary — used on confirmation page and orders pages.
 * Presentational server/client component (no data fetching).
 *
 * Order items carry no title/image from the API — renders minimal (price + index).
 */
import { Badge } from "@bushpop/ui";
import { formatMoney } from "@/lib/format-money";

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

interface OrderSummaryProps {
  status: OrderStatus;
  subtotalCents: number;
  shippingCents: number;
  platformFeeCents: number;
  buyerProtectionFeeCents: number;
  totalCents: number;
  currency: string;
  items: OrderItem[];
  shippingAddressSnapshot: ShippingAddress | null;
  createdAt: string;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  paid: "Paid",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  delivery_assumed: "Delivery assumed",
  shipment_stale_review: "Under review",
  refund_in_progress: "Refund in progress",
  refunded: "Refunded",
};

function getStatusVariant(
  status: OrderStatus,
): "active" | "default" | "draft" | "sold" {
  switch (status) {
    case "paid":
    case "shipped":
    case "delivered":
    case "completed":
      return "active";
    case "cancelled":
    case "refunded":
      return "sold";
    default:
      return "draft";
  }
}

export function OrderSummary({
  status,
  subtotalCents,
  shippingCents,
  buyerProtectionFeeCents,
  totalCents,
  currency,
  items,
  shippingAddressSnapshot,
  createdAt,
}: OrderSummaryProps) {
  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-center gap-3">
        <Badge variant={getStatusVariant(status)}>
          {STATUS_LABELS[status] ?? status}
        </Badge>
        <span className="text-sm text-brand-500">
          {new Date(createdAt).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>

      {/* Items */}
      <div className="divide-y divide-brand-100 rounded-xl border border-brand-200">
        {items.map((item, idx) => (
          <div key={item.id} className="flex justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-brand-800">Item {idx + 1}</p>
              <p className="text-xs text-brand-400">{item.channelListingId}</p>
            </div>
            <p className="text-sm font-semibold text-brand-900">
              {formatMoney(item.priceCents, item.currency)}
            </p>
          </div>
        ))}

        {/* Totals */}
        <div className="space-y-1 px-4 py-3">
          <div className="flex justify-between text-sm">
            <span className="text-brand-600">Subtotal</span>
            <span>{formatMoney(subtotalCents, currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-brand-600">Shipping</span>
            <span>{formatMoney(shippingCents, currency)}</span>
          </div>
          {buyerProtectionFeeCents > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-brand-600">Buyer Protection</span>
              <span>{formatMoney(buyerProtectionFeeCents, currency)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-brand-100 pt-2 text-sm font-bold">
            <span>Total</span>
            <span>{formatMoney(totalCents, currency)}</span>
          </div>
        </div>
      </div>

      {/* Shipping address */}
      {shippingAddressSnapshot && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-brand-800">
            Shipping to
          </h3>
          <address className="not-italic text-sm text-brand-600">
            <p>{shippingAddressSnapshot.line1}</p>
            {shippingAddressSnapshot.line2 && (
              <p>{shippingAddressSnapshot.line2}</p>
            )}
            <p>
              {shippingAddressSnapshot.suburb} {shippingAddressSnapshot.state}{" "}
              {shippingAddressSnapshot.postcode}
            </p>
            <p>{shippingAddressSnapshot.country}</p>
          </address>
        </div>
      )}
    </div>
  );
}
