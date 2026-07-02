/**
 * Orders list page — buyer's order history.
 * Authed + forced dynamic.
 */
import Link from "next/link";
import { requireAuth } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { formatMoney } from "@/lib/format-money";
import { Badge, Button } from "@bushpop/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Orders",
};

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

export default async function OrdersPage() {
  await requireAuth();

  const api = await createAuthedApiClient();
  const { data, error } = await api.GET("/api/v1/store/orders");

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-center text-brand-500">
          Could not load your orders. Please try again.
        </p>
      </main>
    );
  }

  const orders = data?.items ?? [];

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 font-display text-2xl font-bold text-brand-900">
        My Orders
      </h1>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="text-lg text-brand-500">No orders yet</p>
          <p className="text-sm text-brand-400">
            Browse listings and complete a purchase to see your orders here.
          </p>
          <Button asChild variant="primary">
            <Link href="/browse">Browse listings</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="block rounded-xl border border-brand-200 px-4 py-4 transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-brand-400">
                    {new Date(order.createdAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-sm font-medium text-brand-700">
                    {order.items.length} {order.items.length === 1 ? "item" : "items"}
                  </p>
                  <p className="text-base font-bold text-brand-900">
                    {formatMoney(order.totalCents, order.currency)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant={getStatusVariant(order.status)}>
                    {STATUS_LABELS[order.status] ?? order.status}
                  </Badge>
                  <span className="text-xs text-brand-400">View →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
