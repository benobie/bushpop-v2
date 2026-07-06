import Link from "next/link";
import { requireAuth } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { formatMoney } from "@/lib/format-money";
import { Badge } from "@bushpop/ui";

interface DashboardOrdersPageProps {
  searchParams: Promise<{ status?: string }>;
}

// Tabs shown in the UI — a curated subset of the full backend status enum.
const STATUS_FILTERS = ["all", "paid", "shipped", "delivered", "completed", "cancelled"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

// Every status the backend can return, so a direct link (e.g. from an email
// or a bookmark) to a status without its own tab — like ?status=refunded —
// still filters correctly instead of silently falling back to "all".
const ALL_ORDER_STATUSES = [
  "paid",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
  "delivery_assumed",
  "shipment_stale_review",
  "refund_in_progress",
  "refunded",
] as const;
type OrderStatus = (typeof ALL_ORDER_STATUSES)[number];

const STATUS_LABELS: Record<string, string> = {
  all: "All",
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

export default async function DashboardOrdersPage({ searchParams }: DashboardOrdersPageProps) {
  const { status: rawStatus } = await searchParams;
  const isKnownStatus = ALL_ORDER_STATUSES.includes(rawStatus as OrderStatus);
  const statusFilter = (STATUS_FILTERS.includes(rawStatus as StatusFilter) ? rawStatus : "all") as StatusFilter;
  const queryStatus = isKnownStatus ? (rawStatus as OrderStatus) : undefined;

  await requireAuth();
  const api = await createAuthedApiClient();

  const { data, error } = await api.GET("/api/v1/seller/orders", {
    params: {
      query: queryStatus ? { status: queryStatus } : {},
    },
  });

  const orders = data?.items ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-bold text-brand-900">Orders</h1>

      <div className="mt-2 flex gap-4">
        <Link href="/dashboard/listings" className="text-sm text-brand-500 hover:underline">
          View listings →
        </Link>
        <Link href="/dashboard/payouts" className="text-sm text-brand-500 hover:underline">
          View payouts →
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/dashboard/orders" : `/dashboard/orders?status=${s}`}
            className={[
              "rounded-full border px-4 py-1 text-sm font-medium transition-colors",
              statusFilter === s
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-brand-200 text-brand-600 hover:border-brand-400",
            ].join(" ")}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {error && (
        <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          Failed to load orders.
        </p>
      )}

      {orders.length === 0 && !error && (
        <div className="mt-12 text-center text-brand-500">
          {statusFilter === "all" ? "No orders yet." : `No ${STATUS_LABELS[statusFilter]?.toLowerCase()} orders.`}
        </div>
      )}

      {orders.length > 0 && (
        <div className="mt-6 space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/dashboard/orders/${order.id}`}
              className="block rounded-xl border border-brand-100 bg-white px-4 py-4 shadow-sm transition-shadow hover:shadow-md"
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
                    {formatMoney(order.sellerProceedsCents, order.currency)} payout
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

export const metadata = { title: "Orders — Dashboard" };
