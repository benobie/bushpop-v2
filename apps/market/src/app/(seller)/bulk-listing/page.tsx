import { requireAdmin } from "@/lib/require-admin";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { BatchList } from "@/components/bulk-listing/batch-list";

export default async function BulkListingHomePage() {
  await requireAdmin();
  const api = await createAuthedApiClient();
  const { data } = await api.GET("/api/v1/seller/bulk/batches", {
    params: { query: { limit: 20 } },
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-bold text-bp-ink">Bulk listing</h1>
      <p className="mt-1 text-sm text-bp-ink-2">
        Internal tool — intake a rack of items at once: photos → AI draft → review → publish.
      </p>
      <BatchList initialBatches={data?.batches ?? []} />
    </main>
  );
}

export const metadata = { title: "Bulk listing — Internal" };
