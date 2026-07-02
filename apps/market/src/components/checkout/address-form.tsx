"use client";

/**
 * Inline address creation form — used inside CheckoutFlow when no address
 * is selected or the buyer clicks "Add new address".
 */
import { useState } from "react";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { Button, Input, Label } from "@bushpop/ui";

interface AddressFormProps {
  onCreated: (addressId: string) => void;
  onCancel?: () => void;
}

interface FormValues {
  line1: string;
  line2: string;
  suburb: string;
  state: string;
  postcode: string;
}

const INITIAL: FormValues = {
  line1: "",
  line2: "",
  suburb: "",
  state: "",
  postcode: "",
};

export function AddressForm({ onCreated, onCancel }: AddressFormProps) {
  const [values, setValues] = useState<FormValues>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValues((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const api = createBrowserApiClient();
    const { data, error: apiError } = await api.POST("/api/v1/addresses", {
      body: {
        line1: values.line1,
        line2: values.line2 || undefined,
        suburb: values.suburb,
        state: values.state,
        postcode: values.postcode,
        country: "AU",
      },
    });

    if (apiError || !data) {
      setError("Could not save address. Please check your details and try again.");
      setLoading(false);
      return;
    }

    onCreated(data.id);
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="line1">Address line 1</Label>
          <Input
            id="line1"
            name="line1"
            value={values.line1}
            onChange={handleChange}
            placeholder="123 Example Street"
            required
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="line2">Address line 2 (optional)</Label>
          <Input
            id="line2"
            name="line2"
            value={values.line2}
            onChange={handleChange}
            placeholder="Apartment, unit, suite…"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="suburb">Suburb</Label>
          <Input
            id="suburb"
            name="suburb"
            value={values.suburb}
            onChange={handleChange}
            placeholder="Sydney"
            required
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            name="state"
            value={values.state}
            onChange={handleChange}
            placeholder="NSW"
            required
            maxLength={3}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="postcode">Postcode</Label>
          <Input
            id="postcode"
            name="postcode"
            value={values.postcode}
            onChange={handleChange}
            placeholder="2000"
            required
            maxLength={4}
            className="mt-1"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-3">
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? "Saving…" : "Save address"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
