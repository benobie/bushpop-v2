"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@bushpop/ui";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { DEFAULT_CHANNEL } from "@bushpop/config";
import { track } from "@/lib/analytics";
import { CONDITION_LABELS } from "@/lib/condition-labels";

interface EditListingFormProps {
  listingId: string;
  inventoryItemId: string;
  title: string;
  description: string | null;
  priceCents: number;
  version: number;
  condition: string | null;
  size: string | null;
  colour: string | null;
  brand: string | null;
  inventoryVersion: number | null;
}

export function EditListingForm({
  listingId,
  inventoryItemId,
  title,
  description,
  priceCents,
  version,
  condition,
  size,
  colour,
  brand,
  inventoryVersion,
}: EditListingFormProps) {
  const router = useRouter();
  const [formTitle, setFormTitle] = useState(title);
  const [formDescription, setFormDescription] = useState(description ?? "");
  const [formPrice, setFormPrice] = useState((priceCents / 100).toFixed(2));
  const [formCondition, setFormCondition] = useState(condition ?? "");
  const [formSize, setFormSize] = useState(size ?? "");
  const [formColour, setFormColour] = useState(colour ?? "");
  const [formBrand, setFormBrand] = useState(brand ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [currentListingVersion, setCurrentListingVersion] = useState(version);
  const [currentInventoryVersion, setCurrentInventoryVersion] = useState(inventoryVersion);

  useEffect(() => {
    setCurrentListingVersion(version);
  }, [version]);

  useEffect(() => {
    setCurrentInventoryVersion(inventoryVersion);
  }, [inventoryVersion]);

  async function submit() {
    const trimmedTitle = formTitle.trim();
    const priceDollars = Number.parseFloat(formPrice);
    if (!trimmedTitle) {
      setError("Title can't be empty.");
      return;
    }
    if (!Number.isFinite(priceDollars) || priceDollars <= 0) {
      setError("Enter a valid price.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const api = createBrowserApiClient();
      const { data: updatedListing, error: listingError } = await api.PATCH("/api/v1/seller/listings/{id}", {
        params: { path: { id: listingId } },
        body: {
          title: trimmedTitle,
          description: formDescription.trim() || undefined,
          priceCents: Math.round(priceDollars * 100),
          version: currentListingVersion,
        },
      });
      if (listingError) {
        setError(
          typeof listingError === "object" && listingError && "message" in listingError
            ? String((listingError as { message?: unknown }).message)
            : "Failed to save — this listing may have changed elsewhere. Refresh and try again.",
        );
        return;
      }

      if (updatedListing?.version) {
        setCurrentListingVersion(updatedListing.version);
      }

      if (currentInventoryVersion !== null) {
        const { data: updatedInventory, error: inventoryError } = await api.PATCH("/api/v1/seller/inventory/{id}", {
          params: { path: { id: inventoryItemId } },
          body: {
            condition: (formCondition || undefined) as
              | "new_with_tags"
              | "like_new"
              | "good"
              | "fair"
              | "poor"
              | undefined,
            size: formSize.trim() || undefined,
            colour: formColour.trim() || undefined,
            brand: formBrand.trim() || undefined,
            version: currentInventoryVersion,
          },
        });
        if (inventoryError) {
          setError(
            typeof inventoryError === "object" && inventoryError && "message" in inventoryError
              ? String((inventoryError as { message?: unknown }).message)
              : "Listing details saved, but item attributes (condition/size/colour/brand) failed to save — try again.",
          );
          router.refresh();
          return;
        }
        if (updatedInventory?.version) {
          setCurrentInventoryVersion(updatedInventory.version);
        }
      }

      track({ event: "listing.edited", props: { channel: DEFAULT_CHANNEL, listing_id: listingId } });
      setSaved(true);
      router.refresh();
    } catch {
      setError("Could not reach the server — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="edit-title">Title</Label>
        <Input id="edit-title" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} disabled={submitting} />
      </div>
      <div>
        <Label htmlFor="edit-description">Description</Label>
        <textarea
          id="edit-description"
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          disabled={submitting}
          rows={4}
          className="flex w-full rounded-[var(--radius-input)] border border-brand-300 bg-white px-3 py-2 font-body text-sm text-brand-900 placeholder:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <div>
        <Label htmlFor="edit-price">Price (AUD)</Label>
        <Input
          id="edit-price"
          type="number"
          min="0.01"
          step="0.01"
          value={formPrice}
          onChange={(e) => setFormPrice(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="edit-condition">Condition</Label>
          <select
            id="edit-condition"
            value={formCondition}
            onChange={(e) => setFormCondition(e.target.value)}
            disabled={submitting}
            className="flex h-10 w-full rounded-[var(--radius-input)] border border-brand-300 bg-white px-3 py-2 font-body text-sm text-brand-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">—</option>
            {Object.entries(CONDITION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="edit-brand">Brand</Label>
          <Input id="edit-brand" value={formBrand} onChange={(e) => setFormBrand(e.target.value)} disabled={submitting} />
        </div>
        <div>
          <Label htmlFor="edit-size">Size</Label>
          <Input id="edit-size" value={formSize} onChange={(e) => setFormSize(e.target.value)} disabled={submitting} />
        </div>
        <div>
          <Label htmlFor="edit-colour">Colour</Label>
          <Input id="edit-colour" value={formColour} onChange={(e) => setFormColour(e.target.value)} disabled={submitting} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-700">Saved.</p>}

      <Button variant="primary" onClick={submit} disabled={submitting}>
        {submitting ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
