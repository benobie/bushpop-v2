"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@bushpop/ui";
import { createBrowserApiClient } from "@bushpop/api-client/browser";

type ReportStatus = "pending" | "reviewed" | "actioned" | "dismissed";

/**
 * Mirrors REPORT_STATUS_MACHINE (packages/api/src/lib/report-machines.ts):
 * pending -> reviewed -> {actioned, dismissed}; actioned/dismissed -> reviewed.
 * The server re-validates every transition — this is a UI convenience only.
 */
const ACTIONS: Record<ReportStatus, { label: string; target: ReportStatus; destructive?: boolean }[]> = {
  pending: [{ label: "Start review", target: "reviewed" }],
  reviewed: [
    { label: "Approve (dismiss report)", target: "dismissed" },
    { label: "Takedown (hide listing)", target: "actioned", destructive: true },
  ],
  actioned: [{ label: "Reinstate (undo takedown)", target: "reviewed" }],
  dismissed: [{ label: "Reopen", target: "reviewed" }],
};

export function ModerationActions({ reportId, status }: { reportId: string; status: ReportStatus }) {
  const router = useRouter();
  const [confirmingTarget, setConfirmingTarget] = useState<ReportStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = ACTIONS[status] ?? [];

  async function applyTransition(target: ReportStatus) {
    setSubmitting(true);
    setError(null);
    try {
      const api = createBrowserApiClient();
      const { error: apiError } = await api.PATCH("/api/v1/admin/reports/{id}", {
        params: { path: { id: reportId } },
        body: { status: target },
      });
      if (apiError) {
        setError(
          typeof apiError === "object" && apiError && "message" in apiError
            ? String((apiError as { message?: unknown }).message)
            : "Action failed — check the API logs.",
        );
        return;
      }
      setConfirmingTarget(null);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (actions.length === 0) {
    return <span className="text-xs text-bp-ink-3">—</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <Button
            key={action.target}
            variant={action.destructive ? "destructive" : "secondary"}
            size="sm"
            disabled={submitting}
            onClick={() =>
              action.destructive ? setConfirmingTarget(action.target) : applyTransition(action.target)
            }
          >
            {action.label}
          </Button>
        ))}
      </div>
      {confirmingTarget && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs">
          <p className="text-red-900">Hide this listing from buyers? This can be reinstated later.</p>
          <div className="mt-1.5 flex gap-1.5">
            <Button
              variant="destructive"
              size="sm"
              disabled={submitting}
              onClick={() => applyTransition(confirmingTarget)}
            >
              {submitting ? "Applying…" : "Confirm takedown"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={() => setConfirmingTarget(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
