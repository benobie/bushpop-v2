/**
 * Shared order summary — used on confirmation page and orders pages.
 * Presentational server/client component (no data fetching).
 *
 * Order items are enriched (title/coverImage/handle/size/condition/brand)
 * the same "look up fresh" way as the cart response — nulls only if the
 * underlying listing/inventory item has since been deleted.
 */
import Image from "next/image";
import Link from "next/link";
import { Badge, SummaryRow } from "@bushpop/ui";
import { formatMoney } from "@/lib/format-money";

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
    <div className="space-y-6" data-testid="order-summary">
      {/* Status */}
      <div className="flex items-center gap-3">
        <Badge variant={getStatusVariant(status)} data-testid="order-status-badge">
          {STATUS_LABELS[status] ?? status}
        </Badge>
        <span className="text-sm text-[var(--color-bp-ink-2)]">
          {new Date(createdAt).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>

      {/* Items */}
      <div className="divide-y divide-[var(--color-bp-line)] rounded-[var(--radius-bp-rect)] border border-[var(--color-bp-line)]">
        {items.map((item) => {
          const meta = [item.condition, item.brand].filter(Boolean).join(" · ");
          return (
            <div key={item.id} className="flex gap-3 px-4 py-3" data-testid="order-item-row">
              {item.handle ? (
                <Link
                  href={`/listing/${item.handle}`}
                  className="relative h-16 w-[52px] flex-shrink-0 overflow-hidden rounded-[9px] bg-[var(--color-bp-surface-2)]"
                  aria-label={item.title ?? "View listing"}
                >
                  {item.coverImage ? (
                    <Image
                      src={item.coverImage}
                      alt={item.title ?? "Listing photo"}
                      fill
                      className="object-cover"
                      sizes="52px"
                    />
                  ) : null}
                </Link>
              ) : (
                <div
                  className="relative h-16 w-[52px] flex-shrink-0 overflow-hidden rounded-[9px] bg-[var(--color-bp-surface-2)]"
                  aria-label={item.title ?? "Listing no longer available"}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--color-bp-ink)]">
                  {item.title ?? "Listing no longer available"}
                </p>
                {(meta || item.size) && (
                  <p className="mt-0.5 text-xs text-[var(--color-bp-ink-2)]">
                    {[meta, item.size ? `Size ${item.size}` : null].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <p className="flex-shrink-0 whitespace-nowrap text-sm font-semibold text-[var(--color-bp-ink)]">
                {formatMoney(item.priceCents, item.currency)}
              </p>
            </div>
          );
        })}

        {/* Totals */}
        <div className="space-y-1 px-4 py-3">
          <SummaryRow label="Subtotal" value={formatMoney(subtotalCents, currency)} />
          <SummaryRow label="Shipping" value={formatMoney(shippingCents, currency)} />
          {buyerProtectionFeeCents > 0 && (
            <SummaryRow label="Buyer Protection" value={formatMoney(buyerProtectionFeeCents, currency)} />
          )}
          <SummaryRow emphasis label="Total" value={formatMoney(totalCents, currency)} />
        </div>
      </div>

      {/* Shipping address */}
      {shippingAddressSnapshot && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-[var(--color-bp-ink)]">
            Shipping to
          </h3>
          <address className="not-italic text-sm text-[var(--color-bp-ink-2)]">
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
