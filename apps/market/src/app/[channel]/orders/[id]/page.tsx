/**
 * Order detail page — buyer's single order view.
 * Authed + forced dynamic. Reuses OrderSummary.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { OrderSummary } from "@/components/order/order-summary";
import { Button } from "@bushpop/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Order Details",
};

interface OrderDetailPageProps {
  params: Promise<{ channel: string; id: string }>;
}

export default async function OrderDetailPage({
  params,
}: OrderDetailPageProps) {
  await requireAuth();

  const { id } = await params;

  const api = await createAuthedApiClient();
  const { data: order, error } = await api.GET("/api/v1/store/orders/{id}", {
    params: { path: { id } },
  });

  if (error || !order) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/orders">← Orders</Link>
        </Button>
        <h1 className="font-display text-xl font-bold text-brand-900">
          Order Details
        </h1>
      </div>

      <OrderSummary
        status={order.status}
        subtotalCents={order.subtotalCents}
        shippingCents={order.shippingCents}
        platformFeeCents={order.platformFeeCents}
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
    </main>
  );
}
