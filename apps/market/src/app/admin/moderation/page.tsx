import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { isModerationQueueEnabled } from "@/lib/feature-flags";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { formatMoney } from "@/lib/format-money";
import { FlagListingForm } from "@/components/admin/flag-listing-form";
import { ModerationActions } from "@/components/admin/moderation-actions";

const STATUSES = ["pending", "reviewed", "actioned", "dismissed"] as const;

export default async function AdminModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdmin();
  if (!isModerationQueueEnabled()) {
    redirect("/admin");
  }

  const { status, page } = await searchParams;
  const api = await createAuthedApiClient();
  const { data } = await api.GET("/api/v1/admin/reports", {
    params: {
      query: {
        status: status as (typeof STATUSES)[number] | undefined,
        page: page ? Number(page) : 1,
        limit: 25,
      },
    },
  });

  const items = data?.items ?? [];

  return (
    <div>
      <h1 className="text-xl font-bold text-bp-ink">Moderation queue</h1>
      <p className="mt-1 text-sm text-bp-ink-2">
        {data?.total ?? 0} total. Takedown hides the listing immediately (
        <code>channel_listings.hidden_at</code>); every transition is audit-logged via{" "}
        <code>dispatchEvent</code>. Implements docs/takedown-process.md.
      </p>

      <div className="mt-4">
        <FlagListingForm />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link
          href="/admin/moderation"
          className={`rounded px-2 py-1 ${!status ? "bg-bp-obsidian text-white" : "bg-bp-surface-2 text-bp-ink-2"}`}
        >
          all
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/moderation?status=${s}`}
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
              <th className="p-2">Listing</th>
              <th className="p-2">Reason</th>
              <th className="p-2">Reporter</th>
              <th className="p-2">Status</th>
              <th className="p-2">Created</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bp-line">
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-bp-ink-2">
                  No reports found.
                </td>
              </tr>
            )}
            {items.map((report) => (
              <tr key={report.id} className="hover:bg-bp-surface-2">
                <td className="p-2">
                  <div className="font-medium text-bp-ink">{report.listingTitle ?? "—"}</div>
                  <div className="text-xs text-bp-ink-2">
                    {report.priceCents != null
                      ? formatMoney(report.priceCents, report.currency ?? "AUD")
                      : "—"}{" "}
                    · {report.listingStatus ?? "—"}
                    {report.hiddenAt && " · hidden"}
                  </div>
                </td>
                <td className="p-2">
                  <div>{report.reason}</div>
                  {report.description && (
                    <div className="text-xs text-bp-ink-2">{report.description}</div>
                  )}
                </td>
                <td className="p-2 text-xs text-bp-ink-2">{report.reporterEmail ?? report.reporterId}</td>
                <td className="p-2">{report.status}</td>
                <td className="p-2 text-bp-ink-2">
                  {new Date(report.createdAt).toLocaleString("en-AU")}
                </td>
                <td className="p-2">
                  <ModerationActions reportId={report.id} status={report.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const metadata = { title: "Moderation — Admin" };
