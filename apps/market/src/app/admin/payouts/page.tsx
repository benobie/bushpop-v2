import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { formatMoney } from "@/lib/format-money";

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdmin();
  const { status, page } = await searchParams;
  const api = await createAuthedApiClient();
  const { data } = await api.GET("/api/v1/admin/payouts", {
    params: { query: { status, page: page ? Number(page) : 1, limit: 25 } },
  });

  const items = data?.items ?? [];

  return (
    <div>
      <h1 className="text-xl font-bold text-brand-900">Payouts</h1>
      <p className="mt-1 text-sm text-brand-500">
        {data?.total ?? 0} total. Read-only — release stays a separate, already-existing action
        (<code>POST /api/v1/admin/payouts/:holdId/release</code>) outside this v1 UI.
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-brand-100">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-left text-brand-600">
            <tr>
              <th className="p-2">Order</th>
              <th className="p-2">Status</th>
              <th className="p-2">Amount</th>
              <th className="p-2">Transfer</th>
              <th className="p-2">Attempts</th>
              <th className="p-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-brand-500">
                  No payout holds found.
                </td>
              </tr>
            )}
            {items.map((hold) => (
              <tr key={hold.id} className="hover:bg-brand-50">
                <td className="p-2">
                  <Link href={`/admin/orders/${hold.orderId}`} className="font-mono text-brand-700 underline">
                    {hold.orderId.slice(-8)}
                  </Link>
                </td>
                <td className="p-2">{hold.status}</td>
                <td className="p-2">{formatMoney(hold.amountCents, hold.currency)}</td>
                <td className="p-2 font-mono text-xs">{hold.transferId ?? "—"}</td>
                <td className="p-2">{hold.releaseAttempts}</td>
                <td className="p-2 text-brand-500">
                  {new Date(hold.createdAt).toLocaleString("en-AU")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const metadata = { title: "Payouts — Admin" };
