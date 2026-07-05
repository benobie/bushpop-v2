"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@bushpop/ui";
import { createBrowserApiClient } from "@bushpop/api-client/browser";

const REASONS = ["counterfeit", "inappropriate", "misleading", "prohibited", "other"] as const;

export function FlagListingForm() {
  const router = useRouter();
  const [channelListingId, setChannelListingId] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number]>("counterfeit");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submitFlag() {
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const api = createBrowserApiClient();
      const { error: apiError } = await api.POST("/api/v1/admin/moderation/flags", {
        body: {
          channelListingId: channelListingId.trim(),
          reason,
          description: description.trim() || undefined,
        },
      });
      if (apiError) {
        setError(
          typeof apiError === "object" && apiError && "message" in apiError
            ? String((apiError as { message?: unknown }).message)
            : "Flagging failed — check the listing ID and API logs.",
        );
        return;
      }
      setChannelListingId("");
      setDescription("");
      setSuccess(true);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-brand-100 bg-brand-50 p-4">
      <h2 className="text-sm font-semibold text-brand-900">Flag a listing</h2>
      <p className="mt-1 text-xs text-brand-500">
        Internal-only intake — for staff-initiated flags. Public buyer reports arrive via the same
        queue automatically.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-brand-600">
          Channel listing ID
          <input
            className="mt-1 rounded border border-brand-200 px-2 py-1.5 text-sm"
            value={channelListingId}
            onChange={(e) => setChannelListingId(e.target.value)}
            placeholder="01ABC…"
          />
        </label>
        <label className="flex flex-col text-xs text-brand-600">
          Reason
          <select
            className="mt-1 rounded border border-brand-200 px-2 py-1.5 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col text-xs text-brand-600">
          Description (optional)
          <input
            className="mt-1 rounded border border-brand-200 px-2 py-1.5 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why this listing needs review"
          />
        </label>
        <Button
          variant="primary"
          size="sm"
          onClick={submitFlag}
          disabled={submitting || !channelListingId.trim()}
        >
          {submitting ? "Flagging…" : "Flag listing"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {success && <p className="mt-2 text-xs text-green-700">Flagged — added to the queue below.</p>}
    </div>
  );
}
