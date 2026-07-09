import { requireAdmin } from "@/lib/require-admin";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { formatMoney } from "@/lib/format-money";

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdmin();
  const { status, page } = await searchParams;
  const api = await createAuthedApiClient();
  const { data } = await api.GET("/api/v1/admin/listings", {
    params: { query: { status, page: page ? Number(page) : 1, limit: 25 } },
  });

  const items = data?.items ?? [];

  return (
    <div>
      <h1 className="text-xl font-bold text-bp-ink">Listings</h1>
      <p className="mt-1 text-sm text-bp-ink-2">{data?.total ?? 0} total. Read-only.</p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-bp-line">
        <table className="w-full text-sm">
          <thead className="bg-bp-surface-2 text-left text-bp-ink-2">
            <tr>
              <th className="p-2">Title</th>
              <th className="p-2">Status</th>
              <th className="p-2">Price</th>
              <th className="p-2">Owner</th>
              <th className="p-2">Score</th>
              <th className="p-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bp-line">
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-bp-ink-2">
                  No listings found.
                </td>
              </tr>
            )}
            {items.map((listing) => (
              <tr key={listing.id} className="hover:bg-bp-surface-2">
                <td className="p-2">{listing.title}</td>
                <td className="p-2">{listing.status}</td>
                <td className="p-2">{formatMoney(listing.priceCents, listing.currency)}</td>
                <td className="p-2">{listing.ownerName ?? listing.ownerId}</td>
                <td className="p-2">{listing.score ?? "—"}</td>
                <td className="p-2 text-bp-ink-2">
                  {new Date(listing.createdAt).toLocaleString("en-AU")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const metadata = { title: "Listings — Admin" };
