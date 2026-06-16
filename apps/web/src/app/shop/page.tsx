// Pure RSC — no "use client".
// This page is the 301 redirect target for all /shop/:slug/ product URLs.
// It serves as a browse-by-category holding page until Launch 2 marketplace lands.
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Shop Secondhand Fashion",
  description:
    "Browse secondhand clothing and accessories on Bushpop. The marketplace is being rebuilt — check out our size guides in the meantime.",
};

export default function ShopPage() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4">Shop</h1>
      <p className="text-lg text-gray-600 mb-8">
        The Bushpop marketplace is being rebuilt. Check back soon for thousands
        of secondhand items from Australian sellers.
      </p>
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Browse by guide</h2>
        <ul className="space-y-2">
          <li>
            <Link href="/guides/size-charts/" className="text-blue-600 underline">
              Size Charts — find your fit before you buy
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
