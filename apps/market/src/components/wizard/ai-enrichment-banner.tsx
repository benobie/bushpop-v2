"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserApiClient } from "@bushpop/api-client/browser";

interface AiFields {
  title?: string | null;
  description?: string | null;
  colour?: string | null;
  material?: string | null;
  brand?: string | null;
}

interface AiEnrichmentBannerProps {
  itemId: string;
  /** Called when AI enrichment completes — gives parent form values to pre-fill */
  onAiFilled?: (fields: AiFields) => void;
}

type AiStatus = "none" | "processing" | "completed" | "failed";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 30; // 60 seconds total

export function AiEnrichmentBanner({ itemId, onAiFilled }: AiEnrichmentBannerProps) {
  const [status, setStatus] = useState<AiStatus>("none");
  const [dismissed, setDismissed] = useState(false);

  const poll = useCallback(async () => {
    const api = createBrowserApiClient();
    let polls = 0;

    const tick = async () => {
      if (polls >= MAX_POLLS) return;
      polls++;

      const { data } = await api.GET("/api/v1/seller/inventory/{id}", {
        params: { path: { id: itemId } },
      });

      if (!data) return;

      const aiStatus = (data.aiStatus ?? "none") as AiStatus;
      setStatus(aiStatus);

      if (aiStatus === "completed") {
        onAiFilled?.({
          title: data.aiTitle,
          description: data.aiDescription,
          colour: data.aiSuggestedColour,
          material: data.aiSuggestedMaterial,
          brand: data.brand,
        });
      } else if (aiStatus === "processing" || aiStatus === "none") {
        setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    tick();
  }, [itemId, onAiFilled]);

  useEffect(() => {
    poll();
  }, [poll]);

  if (dismissed || status === "completed") return null;
  if (status === "none") return null;
  if (status === "failed") {
    return (
      <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-sm text-red-700">AI enrichment failed. You can fill in the details manually.</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-3 text-xs text-red-500 underline"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
      <div className="h-5 w-5 flex-shrink-0 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      <div className="flex-1">
        <p className="text-sm font-medium text-brand-800">AI is analysing your photos…</p>
        <p className="text-xs text-brand-500">Fields will auto-fill when ready. You can edit them afterwards.</p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-xs text-brand-400 underline"
      >
        Skip
      </button>
    </div>
  );
}
