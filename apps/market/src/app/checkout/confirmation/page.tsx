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
import { Button } from "@bushpop/ui";
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
  await requireAuth();

  const sp = await searchParams;
  const sessionId = getString(sp.session);
  const redirectStatus = getString(sp.redirect_status);

  // Payment failed
  if (redirectStatus === "failed" || (!redirectStatus && !sessionId)) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-xl bg-red-50 px-4 py-4">
          <p className="font-semibold text-red-800">Payment unsuccessful</p>
          <p className="mt-1 text-sm text-red-700">
            Your payment could not be processed. Please try again.
          </p>
        </div>
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
        <div className="rounded-xl bg-brand-50 px-4 py-4">
          <p className="font-semibold text-brand-800">Payment processed</p>
          <p className="mt-1 text-sm text-brand-600">
            Your payment was successful. Check your orders for details.
          </p>
        </div>
        <div className="mt-6">
          <Button asChild variant="primary">
            <Link href="/orders">View orders</Link>
          </Button>
        </div>
      </main>
    );
  }

  // Success — poll for the order
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-8 font-display text-2xl font-bold text-brand-900">
        Order Confirmation
      </h1>
      <OrderPoller sessionId={sessionId} />
    </main>
  );
}
