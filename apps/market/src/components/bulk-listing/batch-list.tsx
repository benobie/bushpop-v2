"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { Button, Input } from "@bushpop/ui";

interface BatchSummary {
  id: string;
  label: string | null;
  itemCount: number;
  publishedCount: number;
  createdAt: string;
  updatedAt: string;
}

export function BatchList({ initialBatches }: { initialBatches: BatchSummary[] }) {
  const router = useRouter();
  const [batches, setBatches] = useState(initialBatches);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);

  async function createBatch() {
    setCreating(true);
    try {
      const api = createBrowserApiClient();
      const { data } = await api.POST("/api/v1/seller/bulk/batches", {
        body: { label: label.trim() || undefined },
      });
      if (data) {
        router.push(`/bulk-listing/${data.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex gap-2">
        <Input
          placeholder="Batch label (optional) — e.g. Rack 1, 05/07"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={createBatch} disabled={creating}>
          {creating ? "Starting…" : "New batch"}
        </Button>
      </div>

      <ul className="mt-6 divide-y divide-bp-line rounded-lg border border-bp-line">
        {batches.length === 0 && (
          <li className="p-4 text-sm text-bp-ink-2">No batches yet — start one above.</li>
        )}
        {batches.map((batch) => (
          <li key={batch.id}>
            <Link
              href={`/bulk-listing/${batch.id}`}
              className="flex items-center justify-between p-4 hover:bg-bp-surface-2"
            >
              <div>
                <p className="font-medium text-bp-ink">{batch.label ?? "Untitled batch"}</p>
                <p className="text-xs text-bp-ink-2">
                  {new Date(batch.createdAt).toLocaleString()}
                </p>
              </div>
              <span className="text-sm text-bp-ink-2">
                {batch.publishedCount}/{batch.itemCount} published
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
