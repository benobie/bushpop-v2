"use client";

// Fresh drops — the one filterable grid on the homepage. Client island: filter
// chips switch the visible demo set. Cards themselves are ProductCard (each with
// its own tiny heart island). Data is illustrative until Launch 2.
import { useState } from "react";
import {
  FRESH_DROPS,
  FRESH_DROP_FILTERS,
  matchesFilter,
  type FreshDropFilter,
} from "@/lib/demo-products";
import { ProductCard } from "./product-card";

export function FreshDrops() {
  const [filter, setFilter] = useState<FreshDropFilter>("All");
  const visible = FRESH_DROPS.filter((p) => matchesFilter(p, filter));

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Filter fresh drops">
        {FRESH_DROP_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            className={filter === f ? "chip on" : "chip"}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
