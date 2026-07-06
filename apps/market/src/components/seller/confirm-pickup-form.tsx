"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@bushpop/ui";
import { createBrowserApiClient } from "@bushpop/api-client/browser";

export function ConfirmPickupForm({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mirrors MarkShippedForm's justShipped guard — keeps the button hidden
  // through the window between the PATCH resolving and router.refresh()
  // landing a re-render with the server's updated `status` prop.
  const [justConfirmed, setJustConfirmed] = useState(false);

  if (status !== "paid" || justConfirmed) {
    return null;
  }

  async function submit() {
    const trimmed = code.trim();
    if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
      setError("Enter the buyer's 6-digit collection code.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const api = createBrowserApiClient();
      const { error: apiError } = await api.PATCH("/api/v1/seller/orders/{id}/confirm-pickup", {
        params: { path: { id: orderId } },
        body: { code: trimmed },
      });
      if (apiError) {
        setError(
          typeof apiError === "object" && apiError && "message" in apiError
            ? String((apiError as { message?: unknown }).message)
            : "Incorrect code or this order can no longer be confirmed.",
        );
        return;
      }
      setOpen(false);
      setJustConfirmed(true);
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
        Confirm pickup
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm">
      <div className="space-y-3">
        <p className="text-brand-700">
          Ask the buyer for their 6-digit collection code after they&apos;ve inspected the item.
          Entering it confirms handover and releases your payout immediately.
        </p>
        <div>
          <Label htmlFor="pickup-code">Collection code</Label>
          <Input
            id="pickup-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            disabled={submitting}
          />
        </div>
        {error && <p className="text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button variant="primary" onClick={submit} disabled={submitting}>
            {submitting ? "Confirming…" : "Confirm pickup"}
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
