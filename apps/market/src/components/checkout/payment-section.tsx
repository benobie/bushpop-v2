"use client";

/**
 * Payment section — Stripe Elements PaymentElement.
 * Rendered inside <Elements> provider (mounted by CheckoutFlow once clientSecret is ready).
 */
import { useState } from "react";
import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import { Button } from "@bushpop/ui";

interface PaymentSectionProps {
  /** The Stripe checkout session ID — included in the return_url so confirmation page can poll orders */
  sessionId: string;
  /** Order totals to display next to the pay button */
  totalCents: number;
  currency: string;
}

export function PaymentSection({ sessionId, totalCents, currency }: PaymentSectionProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formattedTotal = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
  }).format(totalCents / 100);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    // return_url is the public flat route used by the single-tenant app.
    const returnUrl = `${window.location.origin}/checkout/confirmation?session=${sessionId}`;

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl,
      },
    });

    // confirmPayment redirects on success; we only get here on error
    if (result.error) {
      setError(result.error.message ?? "Payment failed. Please try again.");
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handlePay} className="space-y-6">
      <PaymentElement />

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={!stripe || !elements || loading}
      >
        {loading ? "Processing…" : `Pay ${formattedTotal}`}
      </Button>
    </form>
  );
}
