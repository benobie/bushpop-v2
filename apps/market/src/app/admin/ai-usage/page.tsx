import { requireAdmin } from "@/lib/require-admin";
import { createAuthedApiClient } from "@bushpop/api-client/server";

function formatUsd(micros: number | null): string {
  if (micros == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    micros / 1_000_000,
  );
}

export default async function AdminAiUsagePage() {
  await requireAdmin();
  const api = await createAuthedApiClient();
  const [{ data: summary }, { data: recent }] = await Promise.all([
    api.GET("/api/v1/admin/ai-usage/summary", {}),
    api.GET("/api/v1/admin/ai-usage", { params: { query: { page: 1, limit: 50 } } }),
  ]);

  return (
    <div>
      <h1 className="text-xl font-bold text-brand-900">AI draft usage</h1>
      <p className="mt-1 text-sm text-brand-500">
        Cost + status of every AI listing-draft generation. Read-only.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-brand-100 p-4">
          <p className="text-xs text-brand-500">Total generations</p>
          <p className="mt-1 text-2xl font-bold">{summary?.totalGenerations ?? 0}</p>
        </div>
        <div className="rounded-lg border border-brand-100 p-4">
          <p className="text-xs text-brand-500">Total cost</p>
          <p className="mt-1 text-2xl font-bold">{formatUsd(summary?.totalCostUsdMicros ?? 0)}</p>
        </div>
        <div className="rounded-lg border border-brand-100 p-4">
          <p className="text-xs text-brand-500">By provider</p>
          <ul className="mt-1 text-sm">
            {(summary?.byProvider ?? []).map((p) => (
              <li key={p.provider}>
                {p.provider}: {p.count} ({formatUsd(p.costUsdMicros)})
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {(summary?.byStatus ?? []).map((s) => (
          <span key={s.status} className="rounded bg-brand-50 px-2 py-1 text-brand-700">
            {s.status}: {s.count}
          </span>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-brand-100">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-left text-brand-600">
            <tr>
              <th className="p-2">Item</th>
              <th className="p-2">Provider / model</th>
              <th className="p-2">Trigger</th>
              <th className="p-2">Status</th>
              <th className="p-2">Cost</th>
              <th className="p-2">Latency</th>
              <th className="p-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-100">
            {(recent?.items ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-brand-500">
                  No AI generations recorded.
                </td>
              </tr>
            )}
            {(recent?.items ?? []).map((gen) => (
              <tr key={gen.id} className="hover:bg-brand-50">
                <td className="p-2 font-mono text-xs">{gen.inventoryItemId.slice(-8)}</td>
                <td className="p-2">
                  {gen.provider} / {gen.model}
                </td>
                <td className="p-2">{gen.trigger}</td>
                <td className="p-2">{gen.status}</td>
                <td className="p-2">{formatUsd(gen.costUsdMicros)}</td>
                <td className="p-2">{gen.latencyMs != null ? `${gen.latencyMs}ms` : "—"}</td>
                <td className="p-2 text-brand-500">
                  {new Date(gen.createdAt).toLocaleString("en-AU")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const metadata = { title: "AI usage — Admin" };
