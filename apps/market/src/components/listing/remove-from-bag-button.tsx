"use client";

/**
 * Remove-from-bag button — client component.
 * Calls DELETE /api/v1/store/cart/items/{id} then refreshes the page
 * so the server-rendered bag page reflects the updated cart.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { Button } from "@bushpop/ui";

interface RemoveFromBagButtonProps {
  itemId: string;
}

export function RemoveFromBagButton({ itemId }: RemoveFromBagButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRemove() {
    setLoading(true);
    const api = createBrowserApiClient();
    await api.DELETE("/api/v1/store/cart/items/{id}", {
      params: { path: { id: itemId } },
    });
    // Refresh to re-run the server page with updated cart state
    router.refresh();
    setLoading(false);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleRemove}
      disabled={loading}
      className="text-brand-400 hover:text-red-500"
      aria-label="Remove item from bag"
    >
      {loading ? "…" : "Remove"}
    </Button>
  );
}
