import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { createAuthedApiClient } from "@bushpop/api-client/server";

export default async function AdminEmailJobsPage() {
  await requireAdmin();
  const api = await createAuthedApiClient();
  const { data } = await api.GET("/api/v1/admin/email-jobs/failed", {});

  const items = data?.items ?? [];

  return (
    <div>
      <h1 className="text-xl font-bold text-bp-ink">Failed email jobs</h1>
      <p className="mt-1 text-sm text-bp-ink-2">
        The email worker's dead-letter queue (BullMQ, live — not a DB table, so this is a snapshot
        of the most recent failures, not full history).
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-bp-line">
        <table className="w-full text-sm">
          <thead className="bg-bp-surface-2 text-left text-bp-ink-2">
            <tr>
              <th className="p-2">Type</th>
              <th className="p-2">Order</th>
              <th className="p-2">Attempts</th>
              <th className="p-2">Failed reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bp-line">
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-bp-ink-2">
                  Dead-letter queue is empty.
                </td>
              </tr>
            )}
            {items.map((job) => (
              <tr key={job.jobId} className="hover:bg-bp-surface-2">
                <td className="p-2">{job.type}</td>
                <td className="p-2">
                  <Link href={`/admin/orders/${job.orderId}`} className="font-mono text-bp-ink-2 underline">
                    {job.orderId.slice(-8)}
                  </Link>
                </td>
                <td className="p-2">{job.attemptsMade}</td>
                <td className="p-2 text-xs text-red-700">{job.failedReason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const metadata = { title: "Failed email jobs — Admin" };
