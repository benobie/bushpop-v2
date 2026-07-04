"use client";

/**
 * CheckoutFlow — main client island for the checkout page.
 *
 * State machine:
 *   address → initiating → payment → (redirect to /checkout/confirmation)
 *
 * Receives pre-fetched addresses from the server page.
 * Mounts Stripe Elements only after clientSecret is obtained.
 */
import { useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { stripePromise } from "@/lib/stripe-browser";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { AddressForm } from "./address-form";
import { PaymentSection } from "./payment-section";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
} from "@bushpop/ui";
import { formatMoney } from "@/lib/format-money";

interface Address {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
  isDefault: boolean;
}

interface CheckoutSession {
  sessionId: string;
  clientSecret: string;
  totals: {
    subtotalCents: number;
    shippingCents: number;
    buyerProtectionFeeCents: number;
    totalCents: number;
    currency: string;
  };
}

interface CheckoutFlowProps {
  addresses: Address[];
}

type Step = "address" | "initiating" | "payment";

export function CheckoutFlow({ addresses }: CheckoutFlowProps) {
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    defaultAddress?.id ?? null,
  );
  const [showAddressForm, setShowAddressForm] = useState(addresses.length === 0);
  const [addressList, setAddressList] = useState<Address[]>(addresses);
  const [step, setStep] = useState<Step>("address");
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleContinueToPayment() {
    if (!selectedAddressId) return;

    setStep("initiating");
    setCheckoutError(null);

    const api = createBrowserApiClient();
    const { data, error } = await api.POST("/api/v1/store/checkout", {
      body: { shippingAddressId: selectedAddressId },
    });

    if (error) {
      // Type the error to check for MULTI_SELLER code
      const apiError = error as { statusCode?: number; code?: string; message?: string };
      if (apiError?.code === "MULTI_SELLER_CHECKOUT_UNSUPPORTED") {
        setCheckoutError(
          "Your bag contains items from multiple sellers. Please remove items until all items are from one seller, then try again.",
        );
      } else {
        setCheckoutError("Could not initiate checkout. Please try again.");
      }
      setStep("address");
      return;
    }

    if (!data.clientSecret) {
      setCheckoutError("Payment session could not be created. Please try again.");
      setStep("address");
      return;
    }

    setSession({
      sessionId: data.sessionId,
      clientSecret: data.clientSecret,
      totals: data.totals,
    });
    setStep("payment");
  }

  function handleAddressCreated(addressId: string) {
    // We don't have the full address object from POST response — just the ID is enough
    // Refresh by adding a minimal placeholder so the select can show it
    const newAddress: Address = {
      id: addressId,
      label: "New address",
      line1: "",
      line2: null,
      suburb: "",
      state: "",
      postcode: "",
      country: "AU",
      isDefault: false,
    };
    setAddressList((prev) => [...prev, newAddress]);
    setSelectedAddressId(addressId);
    setShowAddressForm(false);
  }

  // ── Address step ──
  if (step === "address" || step === "initiating") {
    return (
      <div className="space-y-6">
        {/* Address selection */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-brand-900">
              Shipping address
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {!showAddressForm && addressList.length > 0 && (
              <div className="space-y-2">
                {addressList.map((addr) => (
                  <label
                    key={addr.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      selectedAddressId === addr.id
                        ? "border-brand-700 bg-brand-50"
                        : "border-brand-200 hover:border-brand-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="address"
                      value={addr.id}
                      checked={selectedAddressId === addr.id}
                      onChange={() => setSelectedAddressId(addr.id)}
                      className="mt-0.5"
                    />
                    <div className="text-sm">
                      {addr.label && (
                        <p className="font-medium text-brand-800">{addr.label}</p>
                      )}
                      <p className="text-brand-600">
                        {addr.line1}
                        {addr.line2 && `, ${addr.line2}`}
                      </p>
                      <p className="text-brand-600">
                        {addr.suburb} {addr.state} {addr.postcode}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {showAddressForm ? (
              <AddressForm
                onCreated={handleAddressCreated}
                onCancel={
                  addressList.length > 0
                    ? () => setShowAddressForm(false)
                    : undefined
                }
              />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddressForm(true)}
              >
                + Add new address
              </Button>
            )}
          </CardContent>
        </Card>

        {checkoutError && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {checkoutError}
          </div>
        )}

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!selectedAddressId || step === "initiating" || showAddressForm}
          onClick={handleContinueToPayment}
        >
          {step === "initiating" ? "Initiating checkout…" : "Continue to payment"}
        </Button>
      </div>
    );
  }

  // ── Payment step ──
  if (step === "payment" && session) {
    return (
      <div className="space-y-6">
        {/* Order summary */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-brand-900">Order summary</h2>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-brand-600">Subtotal</span>
              <span>{formatMoney(session.totals.subtotalCents, session.totals.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-600">Shipping</span>
              <span>{formatMoney(session.totals.shippingCents, session.totals.currency)}</span>
            </div>
            {session.totals.buyerProtectionFeeCents > 0 && (
              <div className="flex justify-between">
                <span className="text-brand-600">Buyer Protection</span>
                <span>{formatMoney(session.totals.buyerProtectionFeeCents, session.totals.currency)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-brand-100 pt-2 font-semibold">
              <span>Total</span>
              <span>{formatMoney(session.totals.totalCents, session.totals.currency)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Stripe Elements */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-brand-900">Payment</h2>
          </CardHeader>
          <CardContent>
            <Elements
              stripe={stripePromise}
              options={{ clientSecret: session.clientSecret }}
            >
              <PaymentSection
                sessionId={session.sessionId}
                totalCents={session.totals.totalCents}
                currency={session.totals.currency}
              />
            </Elements>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
