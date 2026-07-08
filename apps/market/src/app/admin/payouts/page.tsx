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
      <h1 className="text-xl font-bold text-bp-ink">Payouts</h1>
      <p className="mt-1 text-sm text-bp-ink-2">
        {data?.total ?? 0} total. Read-only — release stays a separate, already-existing action
        (<code>POST /api/v1/admin/payouts/:holdId/release</code>) outside this v1 UI.
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-bp-line">
        <table className="w-full text-sm">
          <thead className="bg-bp-surface-2 text-left text-bp-ink-2">
            <tr>
              <th className="p-2">Order</th>
              <th className="p-2">Status</th>
              <th className="p-2">Amount</th>
              <th className="p-2">Transfer</th>
              <th className="p-2">Attempts</th>
              <th className="p-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bp-line">
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-bp-ink-2">
                  No payout holds found.
                </td>
              </tr>
            )}
            {items.map((hold) => (
              <tr key={hold.id} className="hover:bg-bp-surface-2">
                <td className="p-2">
                  <Link href={`/admin/orders/${hold.orderId}`} className="font-mono text-bp-ink-2 underline">
                    {hold.orderId.slice(-8)}
                  </Link>
                </td>
                <td className="p-2">{hold.status}</td>
                <td className="p-2">{formatMoney(hold.amountCents, hold.currency)}</td>
                <td className="p-2 font-mono text-xs">{hold.transferId ?? "—"}</td>
                <td className="p-2">{hold.releaseAttempts}</td>
                <td className="p-2 text-bp-ink-2">
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
