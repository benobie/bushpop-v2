"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@bushpop/ui";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { DEFAULT_CHANNEL } from "@bushpop/config";
import { track } from "@/lib/analytics";

type ListingStatus = "draft" | "active" | "paused" | "sold" | "archived";

interface ListingActionsProps {
  listingId: string;
  status: ListingStatus;
  version: number;
}

type PendingAction = "delist" | "relist" | "mark_sold" | null;

const CONFIRM_COPY: Record<Exclude<PendingAction, null>, { title: string; body: string; confirmLabel: string }> = {
  delist: {
    title: "Delist this item?",
    body: "It will disappear from browse and search immediately. You can relist it any time.",
    confirmLabel: "Delist",
  },
  relist: {
    title: "Relist this item?",
    body: "It will go back live on Bushpop and reappear in browse and search.",
    confirmLabel: "Relist",
  },
  mark_sold: {
    title: "Mark this item as sold?",
    body: "Use this if it sold somewhere else (e.g. a market stall). This can't be undone — the listing will be permanently marked sold and removed from Bushpop.",
    confirmLabel: "Mark sold",
  },
};

export function ListingActions({ listingId, status, version }: ListingActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justUpdatedTo, setJustUpdatedTo] = useState<ListingStatus | null>(null);
  const [currentVersion, setCurrentVersion] = useState(version);

  // Re-sync when the server sends a fresh version — e.g. after the sibling
  // edit form's own PATCH bumps it and calls router.refresh(). Without this,
  // this component's local state (only initialised from the prop on mount)
  // goes stale and every transition 409s against an outdated version.
  useEffect(() => {
    setCurrentVersion(version);
    setJustUpdatedTo(null);
  }, [version, status]);

  const effectiveStatus = justUpdatedTo ?? status;

  async function transition(to: "paused" | "active" | "sold", action: Exclude<PendingAction, null>) {
    setSubmitting(true);
    setError(null);
    try {
      const api = createBrowserApiClient();
      const { data, error: apiError } = await api.PATCH("/api/v1/seller/listings/{id}/status", {
        params: { path: { id: listingId } },
        body: { to, version: currentVersion },
      });
      if (apiError) {
        setError(
          typeof apiError === "object" && apiError && "message" in apiError
            ? String((apiError as { message?: unknown }).message)
            : "Failed to update this listing — it may have already changed. Refresh and try again.",
        );
        return;
      }
      track({
        event: action === "delist" ? "listing.delisted" : action === "relist" ? "listing.relisted" : "listing.marked_sold",
        props: { channel: DEFAULT_CHANNEL, listing_id: listingId },
      });
      setJustUpdatedTo(to);
      if (data?.version) setCurrentVersion(data.version);
      setPending(null);
      router.refresh();
    } catch {
      setError("Could not reach the server — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (effectiveStatus === "archived") {
    return null;
  }

  if (pending) {
    const copy = CONFIRM_COPY[pending];
    const to = pending === "delist" ? "paused" : pending === "relist" ? "active" : "sold";
    return (
      <div className="rounded-lg border border-bp-line bg-bp-surface-2 p-4 text-sm">
        <p className="font-semibold text-bp-ink">{copy.title}</p>
        <p className="mt-1 text-bp-ink-2">{copy.body}</p>
        {error && <p className="mt-2 text-red-600">{error}</p>}
        <div className="mt-3 flex gap-2">
          <Button
            variant={pending === "mark_sold" ? "destructive" : "primary"}
            onClick={() => transition(to, pending)}
            disabled={submitting}
          >
            {submitting ? "Saving…" : copy.confirmLabel}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setPending(null);
              setError(null);
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {effectiveStatus === "active" && (
        <>
          <Button variant="secondary" onClick={() => setPending("delist")}>
            Delist
          </Button>
          <Button variant="destructive" onClick={() => setPending("mark_sold")}>
            Mark as sold
          </Button>
        </>
      )}
      {effectiveStatus === "paused" && (
        <>
          <Button variant="primary" onClick={() => setPending("relist")}>
            Relist
          </Button>
          <Button variant="destructive" onClick={() => setPending("mark_sold")}>
            Mark as sold
          </Button>
        </>
      )}
      {effectiveStatus === "draft" && (
        <p className="text-sm text-bp-ink-2">Finish publishing this draft from the sell wizard.</p>
      )}
      {effectiveStatus === "sold" && <p className="text-sm text-bp-ink-2">This item is marked sold.</p>}
    </div>
  );
}
