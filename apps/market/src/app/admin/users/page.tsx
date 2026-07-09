import { requireAdmin } from "@/lib/require-admin";
import { createAuthedApiClient } from "@bushpop/api-client/server";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const { page } = await searchParams;
  const api = await createAuthedApiClient();
  const { data } = await api.GET("/api/v1/admin/users", {
    params: { query: { page: page ? Number(page) : 1, limit: 25 } },
  });

  const items = data?.items ?? [];

  return (
    <div>
      <h1 className="text-xl font-bold text-bp-ink">Users</h1>
      <p className="mt-1 text-sm text-bp-ink-2">{data?.total ?? 0} total. Read-only.</p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-bp-line">
        <table className="w-full text-sm">
          <thead className="bg-bp-surface-2 text-left text-bp-ink-2">
            <tr>
              <th className="p-2">Name</th>
              <th className="p-2">Email</th>
              <th className="p-2">Verified</th>
              <th className="p-2">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bp-line">
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-bp-ink-2">
                  No users found.
                </td>
              </tr>
            )}
            {items.map((u) => (
              <tr key={u.id} className="hover:bg-bp-surface-2">
                <td className="p-2">{u.name}</td>
                <td className="p-2">{u.email}</td>
                <td className="p-2">{u.emailVerified ? "yes" : "no"}</td>
                <td className="p-2 text-bp-ink-2">{new Date(u.createdAt).toLocaleString("en-AU")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const metadata = { title: "Users — Admin" };
