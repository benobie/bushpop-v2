"use client";

/**
 * CheckoutFlow — main client island for the checkout page.
 *
 * State machine:
 *   address → initiating → payment → (redirect to /checkout/confirmation)
 *
 * Receives pre-fetched addresses + cart items from the server page.
 * Mounts Stripe Elements only after clientSecret is obtained.
 *
 * Layout ported from design/home/checkout.html (U1 restyle): numbered
 * option-card sections in the main column, a sticky order-summary sidebar
 * on desktop (stacks above the form on mobile — cowrap's `order-first`
 * behaviour in the prototype).
 */
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Elements,
  ExpressCheckoutElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { StripeExpressCheckoutElementConfirmEvent } from "@stripe/stripe-js";
import { stripePromise } from "@/lib/stripe-browser";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { AddressForm } from "./address-form";
import { PaymentSection } from "./payment-section";
import { Button, Banner, SummaryRow, ShieldIcon } from "@bushpop/ui";
import { formatMoney } from "@/lib/format-money";
import { track } from "@/lib/analytics";
import { DEFAULT_CHANNEL } from "@bushpop/config";

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

interface CartItem {
  id: string;
  title: string | null;
  coverImage: string | null;
  handle: string | null;
  priceCents: number;
  currency: string;
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
  cartItems: CartItem[];
}

type Step = "address" | "initiating" | "payment";

function SectionHeading({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="mb-4 flex items-center gap-2.5 font-[family-name:var(--font-bp-head)] text-base font-bold text-[var(--color-bp-ink)]">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-bp-ink)] text-xs text-white">
        {n}
      </span>
      {title}
    </h2>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-[var(--radius-bp-rect)] border border-[var(--color-bp-line)] p-5 sm:p-[22px]">
      {children}
    </div>
  );
}

export function CheckoutFlow({ addresses, cartItems }: CheckoutFlowProps) {
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    defaultAddress?.id ?? null,
  );
  const [showAddressForm, setShowAddressForm] = useState(addresses.length === 0);
  const [addressList, setAddressList] = useState<Address[]>(addresses);
  const [step, setStep] = useState<Step>("address");
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // "initiating" is a transient loading substate, not its own funnel step.
  useEffect(() => {
    if (step === "address" || step === "payment") {
      track({ event: "checkout.step", props: { channel: DEFAULT_CHANNEL, step } });
    }
  }, [step]);

  const currency = cartItems[0]?.currency ?? session?.totals.currency ?? "AUD";
  const cartSubtotalCents = cartItems.reduce((sum, item) => sum + item.priceCents, 0);

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

  const summary = (
    <aside className="lg:sticky lg:top-6" data-testid="checkout-summary">
      <div className="rounded-[var(--radius-bp-rect)] border border-[var(--color-bp-line)] bg-[var(--color-bp-surface-3)] p-5">
        <h3 className="mb-3 font-[family-name:var(--font-bp-head)] text-[15px] font-bold text-[var(--color-bp-ink)]">
          Order summary
        </h3>

        <div className="divide-y divide-[var(--color-bp-line)]">
          {cartItems.map((item) => (
            <div key={item.id} className="flex gap-3 py-2.5" data-testid="checkout-summary-item">
              <div className="relative h-[54px] w-[54px] flex-shrink-0 overflow-hidden rounded-[9px] bg-[var(--color-bp-surface-2)]">
                {item.coverImage ? (
                  <Image
                    src={item.coverImage}
                    alt={item.title ?? "Listing photo"}
                    fill
                    className="object-cover"
                    sizes="54px"
                  />
                ) : null}
              </div>
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium leading-tight text-[var(--color-bp-ink)]">
                {item.title ?? "Listing no longer available"}
              </p>
              <p className="flex-shrink-0 whitespace-nowrap font-[family-name:var(--font-bp-head)] text-sm font-bold text-[var(--color-bp-ink)]">
                {formatMoney(item.priceCents, item.currency)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-2 space-y-1" data-testid="order-summary-totals">
          <SummaryRow label="Subtotal" value={formatMoney(cartSubtotalCents, currency)} />
          {session ? (
            <>
              <SummaryRow
                label="Shipping"
                value={formatMoney(session.totals.shippingCents, session.totals.currency)}
              />
              {session.totals.buyerProtectionFeeCents > 0 && (
                <SummaryRow
                  label="Buyer Protection"
                  value={formatMoney(session.totals.buyerProtectionFeeCents, session.totals.currency)}
                />
              )}
              <SummaryRow
                emphasis
                label="Total"
                value={formatMoney(session.totals.totalCents, session.totals.currency)}
                data-testid="checkout-total-row"
              />
            </>
          ) : (
            <p className="pt-1 text-xs text-[var(--color-bp-ink-3)]">
              Shipping and any Buyer Protection fee are calculated once you continue.
            </p>
          )}
        </div>

        <div className="mt-3.5 flex items-start gap-2 text-xs leading-relaxed text-[var(--color-bp-ink-2)]">
          <ShieldIcon size={18} className="mt-0.5 flex-shrink-0 text-[var(--color-bp-green-bright)]" />
          <p>
            Protected by Bushpop Buyer Protection. Funds are held until you confirm your item
            arrived as described.
          </p>
        </div>
      </div>
    </aside>
  );

  // ── Address step ──
  if (step === "address" || step === "initiating") {
    return (
      <div className="grid gap-7 lg:grid-cols-[1fr_400px] lg:items-start">
        <div>
          <Section>
            <SectionHeading n={1} title="Delivery address" />
            <div className="space-y-4">
              {!showAddressForm && addressList.length > 0 && (
                <div className="space-y-2">
                  {addressList.map((addr) => (
                    <label
                      key={addr.id}
                      data-testid={`address-option-${addr.id}`}
                      className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-bp-rect)] border p-3.5 transition-colors ${
                        selectedAddressId === addr.id
                          ? "border-[var(--color-bp-green-ink)] bg-[var(--color-bp-surface-2)] shadow-[0_0_0_1px_var(--color-bp-green-ink)_inset]"
                          : "border-[var(--color-bp-line-2)] hover:border-[var(--color-bp-ink-3)]"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`mt-0.5 h-[18px] w-[18px] flex-shrink-0 rounded-full border-2 ${
                          selectedAddressId === addr.id
                            ? "border-[var(--color-bp-green-ink)] bg-[var(--color-bp-green-ink)] shadow-[inset_0_0_0_3px_#fff]"
                            : "border-[var(--color-bp-line-2)]"
                        }`}
                      />
                      <input
                        type="radio"
                        name="address"
                        value={addr.id}
                        checked={selectedAddressId === addr.id}
                        onChange={() => setSelectedAddressId(addr.id)}
                        className="sr-only"
                      />
                      <div className="text-sm">
                        {addr.label && (
                          <p className="font-medium text-[var(--color-bp-ink)]">{addr.label}</p>
                        )}
                        <p className="text-[var(--color-bp-ink-2)]">
                          {addr.line1}
                          {addr.line2 && `, ${addr.line2}`}
                        </p>
                        <p className="text-[var(--color-bp-ink-2)]">
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
            </div>
          </Section>

          {checkoutError && (
            <Banner variant="error" data-testid="checkout-error" className="mb-4">
              {checkoutError}
            </Banner>
          )}

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!selectedAddressId || step === "initiating" || showAddressForm}
            onClick={handleContinueToPayment}
            data-testid="checkout-continue-button"
          >
            {step === "initiating" ? "Initiating checkout…" : "Continue to payment"}
          </Button>
        </div>

        {summary}
      </div>
    );
  }

  // ── Payment step ──
  if (step === "payment" && session) {
    return (
      <div className="grid gap-7 lg:grid-cols-[1fr_400px] lg:items-start">
        <div>
          <Section>
            <SectionHeading n={2} title="Payment" />
            <Elements
              stripe={stripePromise}
              options={{ clientSecret: session.clientSecret }}
            >
              <ExpressCheckout sessionId={session.sessionId} />
              <PaymentSection
                sessionId={session.sessionId}
                totalCents={session.totals.totalCents}
                currency={session.totals.currency}
              />
            </Elements>
          </Section>
        </div>

        {summary}
      </div>
    );
  }

  return null;
}

/**
 * Apple Pay / Google Pay / Link via Stripe's own ExpressCheckoutElement — the
 * "Payment Request only" route for W4 (no custom Afterpay/PayPal UI). Rendered
 * inside the same <Elements> provider as PaymentSection's card form. Hidden
 * until Stripe reports at least one available wallet (`onReady`) — on a
 * browser/device with none, nothing renders and PaymentSection's card form is
 * the only option, matching the prototype's "or pay with card" divider only
 * showing when there's something above it to divide from.
 */
function ExpressCheckout({ sessionId }: { sessionId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [visible, setVisible] = useState(false);

  async function handleConfirm(event: StripeExpressCheckoutElementConfirmEvent) {
    if (!stripe || !elements) return;
    const returnUrl = `${window.location.origin}/checkout/confirmation?session=${sessionId}`;
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });
    if (error) {
      // ExpressCheckoutElement surfaces its own inline error UI; nothing further to do here.
      console.error("[checkout] Express checkout confirm failed:", error.message);
    }
  }

  return (
    <div className={visible ? "mb-5" : "hidden"} data-testid="express-checkout">
      <ExpressCheckoutElement
        onReady={(event) => {
          if (event.availablePaymentMethods) setVisible(true);
        }}
        onConfirm={handleConfirm}
      />
      {visible && (
        <div className="my-[18px] flex items-center gap-3.5 text-xs text-[var(--color-bp-ink-3)]">
          <span className="h-px flex-1 bg-[var(--color-bp-line)]" />
          or pay with card
          <span className="h-px flex-1 bg-[var(--color-bp-line)]" />
        </div>
      )}
    </div>
  );
}
