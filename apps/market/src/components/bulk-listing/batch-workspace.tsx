"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Badge } from "@bushpop/ui";
import { COLOURS } from "@bushpop/config";
import { compressImageForUpload } from "@/components/sell/photos-step";

/**
 * Internal bulk-listing tool (B2). Deliberately plain — the design-token
 * restyle (B9/U0) is a parallel, separate track; this reuses @bushpop/ui
 * primitives + existing Tailwind brand-* utilities as-is, no new tokens.
 *
 * Every write here goes through the SAME drafts façade / publish gate as
 * /sell (per-draft PATCHes, publishDraft via the batch publish route) — no
 * parallel listing logic lives in this file.
 */

type DraftItem = {
  id: string;
  version: number;
  lifecycleState: string;
  title: string | null;
  brand: string | null;
  categoryId: string | null;
  size: string | null;
  colour: string | null;
  condition: string | null;
  askingPriceCents: number | null;
  aiTitle: string | null;
  aiSuggestedBrand: string | null;
  aiSuggestedColour: string | null;
  aiConfidence: number | null;
  images: Array<{ id: string; url: string; thumbUrl: string; status: string; isPrimary: boolean }>;
  strength: { score: number; band: string; missing: Array<{ key: string }> };
};

type BatchSummary = {
  id: string;
  label: string | null;
  itemCount: number;
  publishedCount: number;
};

const CONDITIONS = ["new_with_tags", "like_new", "good", "fair", "poor"] as const;
const CONDITION_LABELS: Record<string, string> = {
  new_with_tags: "New with tags",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

const AI_POLL_INTERVAL_MS = 1500;
const AI_POLL_CUTOFF_MS = 20_000;
const AI_CONCURRENCY = 2; // stays well under the 6/min per-draft ai-draft rate limit

function centsToInput(cents: number | null): string {
  return cents ? (cents / 100).toFixed(2) : "";
}

function dollarsToCents(value: string): number | undefined {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 100);
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await fn(item!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export function BatchWorkspace({
  initialBatch,
  leafCategories,
}: {
  initialBatch: { batch: BatchSummary; items: DraftItem[] };
  leafCategories: Array<{ id: string; label: string }>;
}) {
  const [batch, setBatch] = useState(initialBatch.batch);
  const [items, setItems] = useState<DraftItem[]>(initialBatch.items);
  const [uploading, setUploading] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [legalAgree, setLegalAgree] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    published: Array<{ itemId: string; handle: string }>;
    failed: Array<{ itemId: string; reason: string; missing?: string[] }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const api = createBrowserApiClient();

  async function refreshBatch() {
    const { data } = await api.GET("/api/v1/seller/bulk/batches/{id}", {
      params: { path: { id: batch.id } },
    });
    if (data) {
      setBatch(data.batch);
      setItems(data.items as DraftItem[]);
    }
  }

  function updateItem(id: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  // ── Photo intake ──

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setUploading(true);
    try {
      const { data: created } = await api.POST("/api/v1/seller/bulk/batches/{id}/drafts", {
        params: { path: { id: batch.id } },
        body: { count: files.length },
      });
      if (!created) return;
      setBatch(created.batch);
      setItems((prev) => [...prev, ...(created.items as DraftItem[])]);

      const pairs = files.map((file, i) => ({ file, draft: created.items[i]! }));
      await runWithConcurrency(pairs, 2, async ({ file, draft }) => {
        const compressed = await compressImageForUpload(file);
        const contentType = (compressed.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";
        const { data: presigned } = await api.POST("/api/v1/seller/drafts/{id}/images/upload-url", {
          params: { path: { id: draft.id } },
          body: { contentType },
        });
        if (!presigned) return;
        await fetch(presigned.uploadUrl, { method: "PUT", body: compressed });
        await api.POST("/api/v1/seller/drafts/{id}/images/{imageId}/confirm", {
          params: { path: { id: draft.id, imageId: presigned.imageId } },
          body: { position: 0, isPrimary: true },
        });
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refreshBatch();
    }
  }

  // ── Field edits (same PATCH endpoints the /sell wizard uses) ──

  async function patchDetails(item: DraftItem, patch: Record<string, unknown>) {
    const { data } = await api.PATCH("/api/v1/seller/drafts/{id}/details", {
      params: { path: { id: item.id } },
      body: { version: item.version, ...patch } as never,
    });
    if (data) updateItem(item.id, data as Partial<DraftItem>);
  }

  async function patchCondition(item: DraftItem, patch: Record<string, unknown>) {
    const { data } = await api.PATCH("/api/v1/seller/drafts/{id}/condition", {
      params: { path: { id: item.id } },
      body: { version: item.version, ...patch } as never,
    });
    if (data) updateItem(item.id, data as Partial<DraftItem>);
  }

  async function patchPrice(item: DraftItem, askingPriceCents: number) {
    const { data } = await api.PATCH("/api/v1/seller/drafts/{id}/price", {
      params: { path: { id: item.id } },
      body: { version: item.version, askingPriceCents },
    });
    if (data) updateItem(item.id, data as Partial<DraftItem>);
  }

  // ── AI drafts (existing per-draft pipeline, looped with a small concurrency cap) ──

  async function pollAiJob(itemId: string, jobId: string): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < AI_POLL_CUTOFF_MS) {
      const { data } = await api.GET("/api/v1/seller/drafts/{id}/ai-draft/{jobId}", {
        params: { path: { id: itemId, jobId } },
      });
      if (data?.status === "completed" || data?.status === "failed") return;
      await new Promise((r) => setTimeout(r, AI_POLL_INTERVAL_MS));
    }
  }

  async function generateAiDrafts() {
    setAiRunning(true);
    try {
      const candidates = items.filter(
        (it) => it.lifecycleState === "owned" && it.images.some((img) => img.status === "ready") && !it.aiTitle,
      );
      await runWithConcurrency(candidates, AI_CONCURRENCY, async (item) => {
        const { data, error } = await api.POST("/api/v1/seller/drafts/{id}/ai-draft", {
          params: { path: { id: item.id } },
          body: { trigger: "auto" },
        });
        if (error || !data) return; // caps hit (429) or no photo yet — skip, not fatal to the batch
        await pollAiJob(item.id, data.jobId);
      });
    } finally {
      setAiRunning(false);
      await refreshBatch();
    }
  }

  function useAiSuggestion(item: DraftItem) {
    void patchDetails(item, {
      title: item.aiTitle ?? item.title,
      brand: item.aiSuggestedBrand ?? item.brand,
      colour: item.aiSuggestedColour ?? item.colour,
    });
  }

  // ── Publish ──

  async function publishBatch() {
    setPublishing(true);
    try {
      const { data } = await api.POST("/api/v1/seller/bulk/batches/{id}/publish", {
        params: { path: { id: batch.id } },
        body: { legalAgree },
      });
      if (data) setPublishResult(data);
      await refreshBatch();
    } finally {
      setPublishing(false);
    }
  }

  const readyToPublish = items.filter((it) => it.lifecycleState === "owned").length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-900">{batch.label ?? "Untitled batch"}</h1>
          <p className="text-sm text-brand-500">
            {batch.publishedCount}/{batch.itemCount} published
          </p>
        </div>
        <a
          href={`/api/v1/seller/bulk/batches/${batch.id}/export.csv`}
          download
          className="rounded-lg border border-brand-300 px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50"
        >
          Export CSV
        </a>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-brand-100 bg-brand-50 p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFilesSelected(e.target.files)}
          disabled={uploading}
          className="text-sm"
        />
        {uploading && <span className="text-sm text-brand-600">Uploading…</span>}
        <Button variant="outline" onClick={generateAiDrafts} disabled={aiRunning || items.length === 0}>
          {aiRunning ? "Generating AI drafts…" : "Generate AI drafts"}
        </Button>
      </div>

      <div className="mt-6 space-y-3">
        {items.map((item) => {
          const primaryImage = item.images.find((img) => img.isPrimary) ?? item.images[0];
          return (
            <div key={item.id} className="flex gap-4 rounded-lg border border-brand-100 p-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md bg-brand-100">
                {primaryImage?.status === "ready" && (
                  <Image src={primaryImage.thumbUrl || primaryImage.url} alt="" fill className="object-cover" sizes="96px" />
                )}
              </div>

              <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
                <Input
                  placeholder="Title"
                  defaultValue={item.title ?? ""}
                  onBlur={(e) => patchDetails(item, { title: e.target.value || null })}
                  className="col-span-2"
                />
                <Input
                  placeholder="Brand"
                  defaultValue={item.brand ?? ""}
                  onBlur={(e) => patchDetails(item, { brand: e.target.value || null })}
                />
                <Input
                  placeholder="Size"
                  defaultValue={item.size ?? ""}
                  onBlur={(e) => patchDetails(item, { size: e.target.value || null })}
                />

                <Select
                  value={item.categoryId ?? undefined}
                  onValueChange={(categoryId) => patchDetails(item, { categoryId })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {leafCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={item.colour ?? undefined}
                  onValueChange={(colour) => patchDetails(item, { colour })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Colour" />
                  </SelectTrigger>
                  <SelectContent>
                    {COLOURS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={item.condition ?? undefined}
                  onValueChange={(condition) => patchCondition(item, { condition })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Condition" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CONDITION_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Price (AUD)"
                  type="number"
                  step="0.01"
                  defaultValue={centsToInput(item.askingPriceCents)}
                  onBlur={(e) => {
                    const cents = dollarsToCents(e.target.value);
                    if (cents) patchPrice(item, cents);
                  }}
                />
              </div>

              <div className="flex w-40 shrink-0 flex-col items-end gap-2 text-right">
                <Badge variant={item.lifecycleState === "for_sale" ? "active" : "draft"}>
                  {item.lifecycleState === "for_sale" ? "Published" : `Strength ${item.strength.score}`}
                </Badge>
                {item.aiTitle && item.lifecycleState === "owned" && (
                  <button
                    type="button"
                    onClick={() => useAiSuggestion(item)}
                    className="text-xs text-brand-600 underline"
                  >
                    Use AI: "{item.aiTitle}"
                  </button>
                )}
                <a href={`/sell?draft=${item.id}`} className="text-xs text-brand-500 underline">
                  Edit in full wizard →
                </a>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="text-sm text-brand-500">Select photos above to start intake — one photo becomes one draft.</p>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-lg border border-brand-100 bg-brand-50 p-4">
        <label className="flex items-center gap-2 text-sm text-brand-800">
          <input type="checkbox" checked={legalAgree} onChange={(e) => setLegalAgree(e.target.checked)} />
          I've reviewed these {readyToPublish} item(s) and confirm they're accurate and legal to sell.
        </label>
        <Button onClick={publishBatch} disabled={publishing || !legalAgree || readyToPublish === 0}>
          {publishing ? "Publishing…" : `Publish ${readyToPublish} ready item(s)`}
        </Button>
      </div>

      {publishResult && (
        <div className="mt-4 space-y-2 text-sm">
          {publishResult.published.length > 0 && (
            <p className="text-green-700">Published {publishResult.published.length} item(s).</p>
          )}
          {publishResult.failed.map((f) => (
            <p key={f.itemId} className="text-red-600">
              Item {f.itemId.slice(-6)} not published — missing: {f.missing?.join(", ") ?? f.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
