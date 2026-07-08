/**
 * Order confirmation page.
 * Stripe redirects here after payment with ?session=<sessionId>&redirect_status=succeeded|failed.
 *
 * If redirect_status is "failed" → show failure state + back to checkout.
 * If succeeded → render OrderPoller which polls for the webhook-created order.
 */
import Link from "next/link";
import { requireAuth } from "@/lib/require-auth";
import { OrderPoller } from "@/components/checkout/order-poller";
import { Button, Banner } from "@bushpop/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Order Confirmation",
};

interface ConfirmationPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ConfirmationPage({
  searchParams,
}: ConfirmationPageProps) {
  const customer = await requireAuth();

  const sp = await searchParams;
  const sessionId = getString(sp.session);
  const redirectStatus = getString(sp.redirect_status);

  // Payment failed
  if (redirectStatus === "failed" || (!redirectStatus && !sessionId)) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <Banner
          variant="error"
          title="Payment unsuccessful"
          data-testid="checkout-payment-failed"
        >
          Your payment could not be processed. Please try again.
        </Banner>
        <div className="mt-6 flex gap-3">
          <Button asChild variant="primary">
            <Link href="/checkout">Try again</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/bag">Back to bag</Link>
          </Button>
        </div>
      </main>
    );
  }

  // No session ID — unusual but handle gracefully
  if (!sessionId) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <Banner variant="neutral" title="Payment processed">
          Your payment was successful. Check your orders for details.
        </Banner>
        <div className="mt-6">
          <Button asChild variant="primary">
            <Link href="/orders">View orders</Link>
          </Button>
        </div>
      </main>
    );
  }

  // Success — poll for the order. OrderPoller owns its own heading for every
  // sub-state (polling spinner / timeout fallback / "It's yours." hero) so
  // this shell stays a plain container.
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-10" data-testid="checkout-confirmation-page">
      <OrderPoller
        sessionId={sessionId}
        isGuest={customer.user.isAnonymous}
        guestEmail={customer.user.email}
      />
    </main>
  );
}
