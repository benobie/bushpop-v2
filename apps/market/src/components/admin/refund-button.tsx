"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@bushpop/ui";
import { createBrowserApiClient } from "@bushpop/api-client/browser";

const REFUNDABLE_STATUSES = new Set(["paid", "shipped", "delivered"]);

export function RefundButton({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!REFUNDABLE_STATUSES.has(status)) {
    return null;
  }

  async function submitRefund() {
    setSubmitting(true);
    setError(null);
    try {
      const api = createBrowserApiClient();
      const { error: apiError } = await api.POST("/api/v1/admin/orders/{id}/refund", {
        params: { path: { id: orderId } },
        body: { reason: "admin_refund" },
      });
      if (apiError) {
        setError(
          typeof apiError === "object" && apiError && "message" in apiError
            ? String((apiError as { message?: unknown }).message)
            : "Refund failed — check the API logs.",
        );
        return;
      }
      setConfirming(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="destructive" onClick={() => setConfirming(true)}>
        Refund via processor
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
      <p className="font-medium text-red-900">
        Refund the buyer's original payment via Stripe? This restores inventory and cannot be
        undone from here.
      </p>
      {error && <p className="mt-2 text-red-700">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button variant="destructive" onClick={submitRefund} disabled={submitting}>
          {submitting ? "Refunding…" : "Confirm refund"}
        </Button>
        <Button variant="secondary" onClick={() => setConfirming(false)} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
