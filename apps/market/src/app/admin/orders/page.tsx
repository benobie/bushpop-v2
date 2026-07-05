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
      <h1 className="text-xl font-bold text-brand-900">Orders</h1>
      <p className="mt-1 text-sm text-brand-500">
        {data?.total ?? 0} total. The refund action is the only write on this page.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link
          href="/admin/orders"
          className={`rounded px-2 py-1 ${!status ? "bg-brand-900 text-white" : "bg-brand-50 text-brand-600"}`}
        >
          all
        </Link>
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/admin/orders?status=${s}`}
            className={`rounded px-2 py-1 ${status === s ? "bg-brand-900 text-white" : "bg-brand-50 text-brand-600"}`}
          >
            {s}
          </Link>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-brand-100">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-left text-brand-600">
            <tr>
              <th className="p-2">Order</th>
              <th className="p-2">Status</th>
              <th className="p-2">Total</th>
              <th className="p-2">Tracking</th>
              <th className="p-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-brand-500">
                  No orders found.
                </td>
              </tr>
            )}
            {items.map((order) => (
              <tr key={order.id} className="hover:bg-brand-50">
                <td className="p-2">
                  <Link href={`/admin/orders/${order.id}`} className="font-mono text-brand-700 underline">
                    {order.id.slice(-8)}
                  </Link>
                </td>
                <td className="p-2">{order.status}</td>
                <td className="p-2">{formatMoney(order.totalCents, order.currency)}</td>
                <td className="p-2">{order.trackingNumber ?? "—"}</td>
                <td className="p-2 text-brand-500">
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
