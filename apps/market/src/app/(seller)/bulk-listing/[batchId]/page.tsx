import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { BatchWorkspace } from "@/components/bulk-listing/batch-workspace";

interface BatchPageProps {
  params: Promise<{ batchId: string }>;
}

export default async function BulkListingBatchPage({ params }: BatchPageProps) {
  await requireAdmin();
  const { batchId } = await params;
  const api = await createAuthedApiClient();

  const [batchRes, parentCategoriesRes] = await Promise.all([
    api.GET("/api/v1/seller/bulk/batches/{id}", { params: { path: { id: batchId } } }),
    api.GET("/api/v1/store/categories", { params: { query: {} } }),
  ]);

  if (!batchRes.data) notFound();

  const parents = parentCategoriesRes.data?.items ?? [];
  const childLists = await Promise.all(
    parents.map((parent) =>
      api.GET("/api/v1/store/categories", { params: { query: { parentId: parent.id } } }),
    ),
  );

  const leafCategories = parents.flatMap((parent, i) => {
    const children = childLists[i]?.data?.items ?? [];
    // Parents with no children (swimwear, activewear, other) count as leaves themselves.
    if (children.length === 0) {
      return [{ id: parent.id, label: parent.name }];
    }
    return children.map((child) => ({ id: child.id, label: `${parent.name} — ${child.name}` }));
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <BatchWorkspace initialBatch={batchRes.data} leafCategories={leafCategories} />
    </main>
  );
}

export const metadata = { title: "Bulk listing batch — Internal" };
