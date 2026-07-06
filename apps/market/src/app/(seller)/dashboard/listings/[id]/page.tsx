import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import { Badge } from "@bushpop/ui";
import { EditListingForm } from "@/components/seller/edit-listing-form";
import { ListingActions } from "@/components/seller/listing-actions";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  sold: "Sold",
  archived: "Archived",
};

function getStatusVariant(status: string): "active" | "default" | "draft" | "paused" | "sold" {
  switch (status) {
    case "active":
      return "active";
    case "draft":
      return "draft";
    case "paused":
      return "paused";
    case "sold":
      return "sold";
    default:
      return "default";
  }
}

export default async function DashboardListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  const api = await createAuthedApiClient();

  const { data: listing, error } = await api.GET("/api/v1/seller/listings/{id}", {
    params: { path: { id } },
  });

  if (error || !listing) {
    notFound();
  }

  const { data: inventoryItem } = await api.GET("/api/v1/seller/inventory/{id}", {
    params: { path: { id: listing.inventoryItemId } },
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/dashboard/listings" className="text-sm text-brand-500 hover:underline">
        ← My listings
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <h1 className="text-lg font-bold text-brand-900">{listing.title}</h1>
        <Badge variant={getStatusVariant(listing.status)}>
          {STATUS_LABELS[listing.status] ?? listing.status}
        </Badge>
      </div>

      {listing.primaryImageUrl && (
        <div className="relative mt-4 aspect-square w-32 overflow-hidden rounded-lg bg-brand-100">
          <Image
            src={listing.primaryImageUrl}
            alt={listing.title}
            fill
            className="object-cover"
            sizes="128px"
          />
        </div>
      )}

      <section className="mt-6 rounded-xl border border-brand-100 bg-white p-4">
        <h2 className="text-sm font-semibold text-brand-900">Listing status</h2>
        <p className="mt-1 text-sm text-brand-500">
          {listing.status === "archived"
            ? "This listing is archived and can no longer be edited or relisted."
            : "Delist to pull this item off Bushpop temporarily, or mark it sold if it sold elsewhere."}
        </p>
        <div className="mt-3">
          <ListingActions
            listingId={listing.id}
            status={listing.status as "draft" | "active" | "paused" | "sold" | "archived"}
            version={listing.version}
          />
        </div>
      </section>

      {listing.status !== "archived" && (
        <section className="mt-6 rounded-xl border border-brand-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-brand-900">Edit details</h2>
          <div className="mt-3">
            <EditListingForm
              listingId={listing.id}
              inventoryItemId={listing.inventoryItemId}
              title={listing.title}
              description={listing.description}
              priceCents={listing.priceCents}
              version={listing.version}
              condition={inventoryItem?.condition ?? null}
              size={inventoryItem?.size ?? null}
              colour={inventoryItem?.colour ?? null}
              brand={inventoryItem?.brand ?? null}
              inventoryVersion={inventoryItem?.version ?? null}
            />
          </div>
        </section>
      )}
    </main>
  );
}

export const metadata = { title: "Listing — Dashboard" };
