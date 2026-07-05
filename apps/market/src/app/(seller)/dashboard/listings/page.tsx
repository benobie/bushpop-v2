import { requireAuth } from "@/lib/require-auth";
import { createAuthedApiClient } from "@bushpop/api-client/server";
import Link from "next/link";
import Image from "next/image";

interface DashboardListingsPageProps {
  searchParams: Promise<{ status?: string }>;
}

const STATUS_FILTERS = ["all", "draft", "active", "paused"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_LABELS: Record<string, string> = {
  all: "All",
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  sold: "Sold",
  archived: "Archived",
};

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    draft: "bg-brand-100 text-brand-600",
    active: "bg-green-100 text-green-700",
    paused: "bg-amber-100 text-amber-700",
    sold: "bg-blue-100 text-blue-700",
    archived: "bg-red-100 text-red-600",
  };
  return (
    <span
      className={[
        "rounded-full px-2 py-0.5 text-xs font-medium",
        colours[status] ?? "bg-brand-100 text-brand-600",
      ].join(" ")}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function centsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function DashboardListingsPage({ searchParams }: DashboardListingsPageProps) {
  const { status: rawStatus } = await searchParams;
  const statusFilter = (STATUS_FILTERS.includes(rawStatus as StatusFilter) ? rawStatus : "all") as StatusFilter;

  await requireAuth();
  const api = await createAuthedApiClient();

  const { data, error } = await api.GET("/api/v1/seller/listings", {
    params: {
      query: statusFilter !== "all" ? { status: statusFilter as "draft" | "active" | "paused" | "sold" | "archived" } : {},
    },
  });

  const listings = data?.items ?? [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-900">My listings</h1>
        <Link
          href="/sell"
          className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white"
        >
          + New listing
        </Link>
      </div>

      <Link
        href="/dashboard/orders"
        className="mt-2 inline-block text-sm text-brand-500 hover:underline"
      >
        View orders →
      </Link>

      {/* Status filters */}
      <div className="mt-6 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/dashboard/listings" : `/dashboard/listings?status=${s}`}
            className={[
              "rounded-full border px-4 py-1 text-sm font-medium transition-colors",
              statusFilter === s
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-brand-200 text-brand-600 hover:border-brand-400",
            ].join(" ")}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {error && (
        <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          Failed to load listings.
        </p>
      )}

      {listings.length === 0 && !error && (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <p className="text-brand-500">
            {statusFilter === "all" ? "You don't have any listings yet." : `No ${statusFilter} listings.`}
          </p>
          {statusFilter === "all" && (
            <Link
              href="/sell"
              className="rounded-lg bg-brand-800 px-6 py-2.5 text-sm font-semibold text-white"
            >
              List your first item
            </Link>
          )}
        </div>
      )}

      {listings.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {listings.map((listing) => {
            const cardContent = (
              <>
                <div className="relative aspect-square bg-brand-100">
                  {(listing as { primaryImageUrl?: string | null }).primaryImageUrl ? (
                    <Image
                      src={(listing as { primaryImageUrl?: string | null }).primaryImageUrl!}
                      alt={listing.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-brand-300">
                      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <p className="truncate text-sm font-medium text-brand-900">{listing.title}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-brand-800">{centsToDollars(listing.priceCents)}</span>
                    <StatusBadge status={listing.status} />
                  </div>
                </div>
              </>
            );

            // Only draft listings map to an inventory-item id the sell
            // wizard understands — active/paused/sold/archived listings
            // don't have a detail page yet (a later phase), so they render
            // as a non-interactive card instead of a broken link into the
            // wizard (which only handles pre-publish drafts).
            if (listing.status === "draft") {
              return (
                <Link
                  key={listing.id}
                  href={`/sell?draft=${listing.inventoryItemId}`}
                  className="group overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm transition-shadow hover:shadow-md"
                >
                  {cardContent}
                </Link>
              );
            }

            return (
              <div
                key={listing.id}
                className="overflow-hidden rounded-xl border border-brand-100 bg-white shadow-sm"
              >
                {cardContent}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

export const metadata = { title: "My listings — Dashboard" };
