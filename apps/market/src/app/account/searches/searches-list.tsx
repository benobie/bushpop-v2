"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input } from "@bushpop/ui";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { categoryLabel } from "@/lib/category-labels";
import { conditionLabel } from "@/lib/condition-labels";
import { track } from "@/lib/analytics";
import { DEFAULT_CHANNEL } from "@bushpop/config";

export interface SavedSearchItem {
  id: string;
  name: string | null;
  query: string;
  filters: Record<string, unknown>;
  createdAt: string;
}

const FILTER_LABELS: Record<string, string> = {
  categorySlug: "Category",
  size: "Size",
  colour: "Colour",
  brand: "Brand",
  condition: "Condition",
  minPrice: "Min price",
  maxPrice: "Max price",
};

/** Filters here are always flat string/number/boolean values — the API's schema
 * technically allows nested objects/arrays too, but this UI never produces
 * them, so anything else is treated as unrenderable rather than stringified
 * into garbage like "[object Object]". */
function isPrimitiveFilterValue(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function filterValueLabel(key: string, value: unknown): string {
  if (!isPrimitiveFilterValue(value)) return String(value);
  const str = String(value);
  if (key === "categorySlug") return categoryLabel(str);
  if (key === "condition") return conditionLabel(str) ?? str;
  return str;
}

/** Reconstructs a /shop or /search URL from a saved search's query + filters. */
function runAgainHref(search: SavedSearchItem): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search.filters)) {
    if (isPrimitiveFilterValue(value)) {
      params.set(key, String(value));
    }
  }
  // "*" is the sentinel we save when there's no free-text query (browse-only,
  // filter-driven searches) — see save-search-button.tsx.
  if (search.query !== "*") {
    params.set("q", search.query);
    return `/search?${params.toString()}`;
  }
  return `/shop?${params.toString()}`;
}

export function SearchesList({ items }: { items: SavedSearchItem[] }) {
  const [list, setList] = useState(items);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const api = createBrowserApiClient();
      const { response } = await api.DELETE("/api/v1/customer/saved-searches/{id}", {
        params: { path: { id } },
      });
      if (response.ok) {
        track({ event: "search.deleted", props: { channel: DEFAULT_CHANNEL } });
        setList((current) => current.filter((s) => s.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  function startEditing(search: SavedSearchItem) {
    setEditingId(search.id);
    setLabelDraft(search.name ?? "");
  }

  function cancelEditing() {
    setEditingId(null);
    setLabelDraft("");
  }

  async function handleSaveLabel(id: string) {
    setSavingLabel(true);
    try {
      const api = createBrowserApiClient();
      const trimmed = labelDraft.trim();
      const { response, data } = await api.PATCH("/api/v1/customer/saved-searches/{id}", {
        params: { path: { id } },
        body: { name: trimmed || null },
      });
      if (response.ok && data) {
        track({ event: "search.renamed", props: { channel: DEFAULT_CHANNEL } });
        setList((current) => current.map((s) => (s.id === id ? { ...s, name: data.name } : s)));
        setEditingId(null);
        setLabelDraft("");
      }
    } finally {
      setSavingLabel(false);
    }
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-lg text-bp-ink-2">No saved searches yet</p>
        <p className="text-sm text-bp-ink-3">
          Filter listings on Browse or Search, then use "Save this search" to keep it here.
        </p>
        <Link href="/shop" className="rounded-lg bg-bp-obsidian px-4 py-2 text-sm font-semibold text-white">
          Browse listings
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {list.map((search) => {
        const filterEntries = Object.entries(search.filters).filter(
          ([, v]) => v !== undefined && v !== null && v !== "",
        );
        return (
          <div
            key={search.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-bp-line px-4 py-4"
          >
            <div className="min-w-0 flex-1">
              {editingId === search.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    placeholder="Label (optional)"
                    maxLength={100}
                    className="h-8 w-48 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleSaveLabel(search.id)}
                    disabled={savingLabel}
                  >
                    {savingLabel ? "Saving…" : "Save"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEditing} disabled={savingLabel}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-bp-ink">
                    {search.name || (search.query !== "*" ? search.query : "Filtered browse")}
                  </p>
                  <button
                    type="button"
                    onClick={() => startEditing(search)}
                    className="shrink-0 text-xs text-bp-ink-3 underline transition-colors hover:text-bp-green-bright"
                  >
                    {search.name ? "Rename" : "Add label"}
                  </button>
                </div>
              )}
              {filterEntries.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {filterEntries.map(([key, value]) => (
                    <span
                      key={key}
                      className="rounded-full border border-bp-line bg-bp-surface-2 px-2 py-0.5 text-xs text-bp-ink-2"
                    >
                      {FILTER_LABELS[key] ?? key}: {filterValueLabel(key, value)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={runAgainHref(search)}>Run again</Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(search.id)}
                disabled={deletingId === search.id}
                className="text-red-600"
              >
                {deletingId === search.id ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
