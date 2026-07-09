import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { formatMoney } from "@/lib/format-money";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdmin();
  const { status, page } = await searchParams;
  const api = await createAuthedApiClient();
  const { data } = await api.GET("/api/v1/admin/orders", {
    params: { query: { status, page: page ? Number(page) : 1, limit: 25 } },
  });

  const items = data?.items ?? [];
  const statuses = ["paid", "shipped", "delivered", "refund_in_progress", "refunded", "cancelled"];

  return (
    <div>
      <h1 className="text-xl font-bold text-bp-ink">Orders</h1>
      <p className="mt-1 text-sm text-bp-ink-2">
        {data?.total ?? 0} total. The refund action is the only write on this page.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link
          href="/admin/orders"
          className={`rounded px-2 py-1 ${!status ? "bg-bp-obsidian text-white" : "bg-bp-surface-2 text-bp-ink-2"}`}
        >
          all
        </Link>
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/admin/orders?status=${s}`}
            className={`rounded px-2 py-1 ${status === s ? "bg-bp-obsidian text-white" : "bg-bp-surface-2 text-bp-ink-2"}`}
          >
            {s}
          </Link>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-bp-line">
        <table className="w-full text-sm">
          <thead className="bg-bp-surface-2 text-left text-bp-ink-2">
            <tr>
              <th className="p-2">Order</th>
              <th className="p-2">Status</th>
              <th className="p-2">Total</th>
              <th className="p-2">Tracking</th>
              <th className="p-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bp-line">
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-bp-ink-2">
                  No orders found.
                </td>
              </tr>
            )}
            {items.map((order) => (
              <tr key={order.id} className="hover:bg-bp-surface-2">
                <td className="p-2">
                  <Link href={`/admin/orders/${order.id}`} className="font-mono text-bp-ink-2 underline transition-colors hover:text-bp-green-bright">
                    {order.id.slice(-8)}
                  </Link>
                </td>
                <td className="p-2">{order.status}</td>
                <td className="p-2">{formatMoney(order.totalCents, order.currency)}</td>
                <td className="p-2">{order.trackingNumber ?? "—"}</td>
                <td className="p-2 text-bp-ink-2">
                  {new Date(order.createdAt).toLocaleString("en-AU")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const metadata = { title: "Orders — Admin" };
