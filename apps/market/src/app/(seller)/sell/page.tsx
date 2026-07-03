import { requireAuth } from "@/lib/require-auth";
import { SellWizard, type DraftSummary } from "@/components/sell/sell-wizard";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import "@/components/sell/sell.css";

interface SellPageProps {
  searchParams: Promise<{ draft?: string }>;
}

export default async function SellPage({ searchParams }: SellPageProps) {
  await requireAuth();
  const api = await createAuthedApiClient();
  const { draft: draftIdParam } = await searchParams;

  let existingDraft: DraftSummary | null = null;

  if (draftIdParam) {
    const { data } = await api.GET("/api/v1/seller/drafts/{id}", {
      params: { path: { id: draftIdParam } },
    });

    if (data) {
      existingDraft = {
        id: data.id,
        version: data.version,
        title: data.title,
        updatedAt: data.updatedAt,
        readyImageCount: data.images.filter((image) => image.status === "ready").length,
        strengthScore: data.strength.score,
      };
    }
  } else {
    const { data } = await api.GET("/api/v1/seller/drafts", {
      params: { query: { limit: 1 } },
    });

    existingDraft = data?.drafts?.[0] ?? null;
  }

  return (
    <SellWizard
      existingDraft={existingDraft}
      initialDraftId={draftIdParam ?? existingDraft?.id ?? null}
    />
  );
}

export const metadata = { title: "List an item — Sell" };
