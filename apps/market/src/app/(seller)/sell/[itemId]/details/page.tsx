"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { AiEnrichmentBanner } from "@/components/wizard/ai-enrichment-banner";

interface DetailsForm {
  title: string;
  description: string;
  brand: string;
  colour: string;
  material: string;
  condition: "" | "new_with_tags" | "like_new" | "good" | "fair" | "poor";
  conditionNotes: string;
  size: string;
}

const CONDITION_LABELS: Record<string, string> = {
  new_with_tags: "New with tags",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

export default function DetailsPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<DetailsForm>({
    title: "",
    description: "",
    brand: "",
    colour: "",
    material: "",
    condition: "",
    conditionNotes: "",
    size: "",
  });

  function setField<K extends keyof DetailsForm>(key: K, value: DetailsForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleAiFilled(fields: {
    title?: string | null;
    description?: string | null;
    colour?: string | null;
    material?: string | null;
    brand?: string | null;
  }) {
    setForm((prev) => ({
      ...prev,
      title: prev.title || fields.title || "",
      description: prev.description || fields.description || "",
      colour: prev.colour || fields.colour || "",
      material: prev.material || fields.material || "",
      brand: prev.brand || fields.brand || "",
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title) {
      setError("Title is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const api = createBrowserApiClient();

    // We need a version number — fetch the item first
    const { data: item } = await api.GET("/api/v1/seller/inventory/{id}", {
      params: { path: { id: itemId } },
    });

    if (!item) {
      setError("Could not load item. Please refresh and try again.");
      setSaving(false);
      return;
    }

    const { error: patchError } = await api.PATCH("/api/v1/seller/inventory/{id}", {
      params: { path: { id: itemId } },
      body: {
        title: form.title || undefined,
        description: form.description || undefined,
        brand: form.brand || undefined,
        colour: form.colour || undefined,
        material: form.material || undefined,
        condition: form.condition || undefined,
        conditionNotes: form.conditionNotes || undefined,
        size: form.size || undefined,
        version: item.version,
      },
    });

    if (patchError) {
      setError("Failed to save details. Please try again.");
      setSaving(false);
      return;
    }

    router.push(`/sell/${itemId}/pricing`);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <StepIndicator currentStep="Details" />

      <div className="mt-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-brand-900">Item details</h1>
          <p className="mt-1 text-sm text-brand-500">
            Describe your item so buyers know exactly what they&apos;re getting.
          </p>
        </div>

        <AiEnrichmentBanner itemId={itemId} onAiFilled={handleAiFilled} />

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium text-brand-800">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              maxLength={255}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              placeholder="e.g. Vintage Levi's 501 Jeans"
            />
          </div>

          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-medium text-brand-800">
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              placeholder="Describe the style, fit, and any flaws…"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="brand" className="mb-1 block text-sm font-medium text-brand-800">Brand</label>
              <input
                id="brand"
                type="text"
                value={form.brand}
                onChange={(e) => setField("brand", e.target.value)}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                placeholder="e.g. Levi's"
              />
            </div>
            <div>
              <label htmlFor="size" className="mb-1 block text-sm font-medium text-brand-800">Size</label>
              <input
                id="size"
                type="text"
                value={form.size}
                onChange={(e) => setField("size", e.target.value)}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                placeholder="e.g. M, 32W, 10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="colour" className="mb-1 block text-sm font-medium text-brand-800">Colour</label>
              <input
                id="colour"
                type="text"
                value={form.colour}
                onChange={(e) => setField("colour", e.target.value)}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                placeholder="e.g. Indigo"
              />
            </div>
            <div>
              <label htmlFor="material" className="mb-1 block text-sm font-medium text-brand-800">Material</label>
              <input
                id="material"
                type="text"
                value={form.material}
                onChange={(e) => setField("material", e.target.value)}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                placeholder="e.g. 100% Cotton"
              />
            </div>
          </div>

          <div>
            <label htmlFor="condition" className="mb-1 block text-sm font-medium text-brand-800">
              Condition
            </label>
            <select
              id="condition"
              value={form.condition}
              onChange={(e) => setField("condition", e.target.value as DetailsForm["condition"])}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">Select condition…</option>
              {Object.entries(CONDITION_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {form.condition && form.condition !== "new_with_tags" && (
            <div>
              <label htmlFor="conditionNotes" className="mb-1 block text-sm font-medium text-brand-800">
                Condition notes
              </label>
              <textarea
                id="conditionNotes"
                rows={2}
                value={form.conditionNotes}
                onChange={(e) => setField("conditionNotes", e.target.value)}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                placeholder="Describe any wear, stains, or damage…"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push(`/sell/${itemId}/photos`)}
              className="rounded-lg border border-brand-200 px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-800 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? "Saving…" : "Next: Pricing"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
