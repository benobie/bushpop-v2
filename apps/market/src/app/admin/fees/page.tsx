import { requireAdmin } from "@/lib/require-admin";
import { createAuthedApiClient } from "@bushpop/api-client/server";

export default async function AdminFeesPage() {
  await requireAdmin();
  const api = await createAuthedApiClient();
  const { data } = await api.GET("/api/v1/admin/fees", {});

  return (
    <div>
      <h1 className="text-xl font-bold text-bp-ink">Fees</h1>
      <p className="mt-1 text-sm text-bp-ink-2">
        Read-only. Changes go through the <code>fees.ts</code> review path — never edited here.
      </p>

      <section className="mt-4 rounded-lg border border-bp-line p-4">
        <h2 className="text-sm font-semibold text-bp-ink">Seller commission</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-bp-ink-2">
            <tr>
              <th className="p-1">Effective from</th>
              <th className="p-1">Rate</th>
              <th className="p-1">Flat</th>
            </tr>
          </thead>
          <tbody>
            {(data?.commissionSchedule ?? []).map((row) => (
              <tr key={row.effectiveFrom}>
                <td className="p-1">{row.effectiveFrom}</td>
                <td className="p-1">{(row.bps / 100).toFixed(2)}%</td>
                <td className="p-1">${(row.fixedCents / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-4 rounded-lg border border-bp-line p-4">
        <h2 className="text-sm font-semibold text-bp-ink">Buyer Protection fee</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-bp-ink-2">
            <tr>
              <th className="p-1">Effective from</th>
              <th className="p-1">Rate</th>
              <th className="p-1">Flat</th>
            </tr>
          </thead>
          <tbody>
            {(data?.buyerProtectionSchedule ?? []).map((row) => (
              <tr key={row.effectiveFrom}>
                <td className="p-1">{row.effectiveFrom}</td>
                <td className="p-1">{(row.bps / 100).toFixed(2)}%</td>
                <td className="p-1">${(row.fixedCents / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-bp-ink-2">$0 on pickup orders, uncapped, no promo.</p>
      </section>
    </div>
  );
}

export const metadata = { title: "Fees — Admin" };
