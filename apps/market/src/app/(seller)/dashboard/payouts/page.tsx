import Link from "next/link";
import { requireAuth } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { formatMoney } from "@/lib/format-money";
import { Badge } from "@bushpop/ui";

const STATUS_LABELS: Record<string, string> = {
  held: "Held",
  releasing: "Releasing",
  released: "Paid out",
  refunded: "Refunded",
  blocked: "Blocked",
  release_failed_retryable: "Retrying",
  release_failed_manual: "Needs attention",
};

function getStatusVariant(status: string): "active" | "default" | "draft" | "sold" {
  switch (status) {
    case "released":
      return "active";
    case "held":
    case "releasing":
      return "draft";
    case "refunded":
      return "sold";
    default:
      return "default";
  }
}

export default async function DashboardPayoutsPage() {
  await requireAuth();
  const api = await createAuthedApiClient();

  const { data, error } = await api.GET("/api/v1/seller/payouts", {
    params: { query: {} },
  });

  const items = data?.items ?? [];
  const totalsByStatus = data?.totalsByStatus ?? [];
  const heldTotal = totalsByStatus.find((t) => t.status === "held")?.totalCents ?? 0;
  const releasedTotal = totalsByStatus.find((t) => t.status === "released")?.totalCents ?? 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-bold text-brand-900">Payouts</h1>

      <Link
        href="/dashboard/orders"
        className="mt-2 inline-block text-sm text-brand-500 hover:underline"
      >
        View orders →
      </Link>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-brand-100 bg-white p-4">
          <p className="text-xs text-brand-500">Held</p>
          <p className="mt-1 text-lg font-bold text-brand-900">{formatMoney(heldTotal)}</p>
        </div>
        <div className="rounded-xl border border-brand-100 bg-white p-4">
          <p className="text-xs text-brand-500">Paid out</p>
          <p className="mt-1 text-lg font-bold text-brand-900">{formatMoney(releasedTotal)}</p>
        </div>
      </div>

      {error && (
        <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          Failed to load payouts.
        </p>
      )}

      {items.length === 0 && !error && (
        <div className="mt-12 text-center text-brand-500">No payouts yet.</div>
      )}

      {items.length > 0 && (
        <div className="mt-6 space-y-3">
          {items.map((payout) => (
            <Link
              key={payout.id}
              href={`/dashboard/orders/${payout.orderId}`}
              className="block rounded-xl border border-brand-100 bg-white px-4 py-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-brand-400">
                    {new Date(payout.createdAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <p className="font-mono text-xs text-brand-600">{payout.orderId}</p>
                  <p className="text-base font-bold text-brand-900">
                    {formatMoney(payout.amountCents, payout.currency)}
                  </p>
                </div>
                <Badge variant={getStatusVariant(payout.status)}>
                  {STATUS_LABELS[payout.status] ?? payout.status}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

export const metadata = { title: "Payouts — Dashboard" };
