"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@bushpop/ui";
import { createBrowserApiClient } from "@bushpop/api-client/browser";

export function MarkShippedForm({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks the just-shipped outcome locally so the button stays hidden
  // through the window between the PATCH resolving and router.refresh()
  // landing a re-render with the server's updated `status` prop — without
  // this, a seller could double-click and fire a second ship request that
  // 409s against the order they just shipped.
  const [justShipped, setJustShipped] = useState(false);

  if (status !== "paid" || justShipped) {
    return null;
  }

  async function submit() {
    if (!trackingNumber.trim() || !carrier.trim()) {
      setError("Tracking number and carrier are both required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const api = createBrowserApiClient();
      const { error: apiError } = await api.PATCH("/api/v1/seller/orders/{id}/ship", {
        params: { path: { id: orderId } },
        body: { trackingNumber: trackingNumber.trim(), carrier: carrier.trim() },
      });
      if (apiError) {
        setError(
          typeof apiError === "object" && apiError && "message" in apiError
            ? String((apiError as { message?: unknown }).message)
            : "Failed to mark this order as shipped — it may have already been updated.",
        );
        return;
      }
      setOpen(false);
      setJustShipped(true);
      router.refresh();
    } catch {
      setError("Could not reach the server — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        Mark as shipped
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-bp-line bg-bp-surface-2 p-4 text-sm">
      <div className="space-y-3">
        <div>
          <Label htmlFor="carrier">Carrier</Label>
          <Input
            id="carrier"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            placeholder="e.g. Australia Post"
            disabled={submitting}
          />
        </div>
        <div>
          <Label htmlFor="tracking-number">Tracking number</Label>
          <Input
            id="tracking-number"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="e.g. 1234567890"
            disabled={submitting}
          />
        </div>
        {error && <p className="text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? "Saving…" : "Confirm shipped"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
