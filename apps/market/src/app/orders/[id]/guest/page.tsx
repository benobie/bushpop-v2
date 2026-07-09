/**
 * Guest order-access page (BF-08) — reached from the order-confirmation
 * email link, works with no session at all (cookie cleared, different
 * device, anonymous session expired). The `token` query param IS the
 * ownership proof — verified server-side by the API
 * (GET /api/v1/store/orders/:id/guest), not by anything client-trusted here.
 *
 * Deliberately a standalone page + createPublicApiClient (no cookies sent) —
 * does not touch /orders/[id]/page.tsx or require-auth.ts.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { createPublicApiClient } from "@bushpop/api-client/server";
import { OrderSummary } from "@/components/order/order-summary";
import { Button } from "@bushpop/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Order",
};

interface GuestOrderPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GuestOrderPage({ params, searchParams }: GuestOrderPageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const token = Array.isArray(sp.token) ? sp.token[0] : sp.token;

  if (!token) {
    notFound();
  }

  const api = createPublicApiClient();
  const { data: order, error } = await api.GET("/api/v1/store/orders/{id}/guest", {
    params: { path: { id }, query: { token } },
  });

  if (error || !order) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-6 font-display text-xl font-bold text-brand-900">Your Order</h1>

      <OrderSummary
        status={order.status}
        subtotalCents={order.subtotalCents}
        shippingCents={order.shippingCents}
        buyerProtectionFeeCents={order.buyerProtectionFeeCents}
        totalCents={order.totalCents}
        currency={order.currency}
        items={order.items}
        shippingAddressSnapshot={order.shippingAddressSnapshot}
        createdAt={order.createdAt}
      />

      {order.trackingNumber && (
        <div className="mt-6 rounded-xl border border-brand-200 px-4 py-4">
          <p className="text-sm font-semibold text-brand-800">Tracking</p>
          <p className="mt-1 text-sm text-brand-600">
            {order.trackingCarrier && `${order.trackingCarrier}: `}
            {order.trackingNumber}
          </p>
        </div>
      )}

      <div className="mt-8 rounded-xl border border-brand-200 bg-brand-50 px-4 py-4">
        <p className="text-sm font-semibold text-brand-800">Want to track every order in one place?</p>
        <p className="mt-1 text-sm text-brand-600">
          Create an account with this email and your order history comes with you.
        </p>
        <Button asChild variant="primary" size="sm" className="mt-3">
          <Link href="/sign-up">Create an account</Link>
        </Button>
      </div>
    </main>
  );
}
