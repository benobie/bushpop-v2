"use client";

/**
 * Client filter bar — sort, condition, price range.
 * Syncs state to URL search params via useRouter so the RSC page re-fetches
 * with the new filters server-side (no client-side data fetching needed).
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
  Button,
} from "@bushpop/ui";

interface FilterBarProps {
  basePath: "/browse" | "/search";
  /** Current query string (for search page — preserves `q` param) */
  q?: string;
}

export function FilterBar({ basePath, q }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const pushFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      // Reset pagination on filter change
      params.delete("offset");
      // Preserve q for search pages
      if (q && !params.has("q")) params.set("q", q);
      router.push(`${basePath}?${params.toString()}`);
    },
    [router, searchParams, basePath, q],
  );

  const currentSort = searchParams.get("sort") ?? "";
  const currentCondition = searchParams.get("condition") ?? "";

  function handleMinPrice(e: React.ChangeEvent<HTMLInputElement>) {
    pushFilter("minPrice", e.target.value);
  }

  function handleMaxPrice(e: React.ChangeEvent<HTMLInputElement>) {
    pushFilter("maxPrice", e.target.value);
  }

  function handleClear() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Sort */}
      <Select
        value={currentSort}
        onValueChange={(v) => pushFilter("sort", v === "newest" ? "" : v)}
      >
        <SelectTrigger className="h-9 w-40 text-sm">
          <SelectValue placeholder="Sort: Newest" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">Newest</SelectItem>
          <SelectItem value="price_asc">Price: low to high</SelectItem>
          <SelectItem value="price_desc">Price: high to low</SelectItem>
        </SelectContent>
      </Select>

      {/* Condition */}
      <Select
        value={currentCondition}
        onValueChange={(v) => pushFilter("condition", v === "all" ? "" : v)}
      >
        <SelectTrigger className="h-9 w-36 text-sm">
          <SelectValue placeholder="Condition" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All conditions</SelectItem>
          <SelectItem value="new">New</SelectItem>
          <SelectItem value="like_new">Like new</SelectItem>
          <SelectItem value="good">Good</SelectItem>
          <SelectItem value="fair">Fair</SelectItem>
        </SelectContent>
      </Select>

      {/* Price range */}
      <div className="flex items-center gap-1">
        <Input
          type="number"
          placeholder="Min $"
          defaultValue={searchParams.get("minPrice") ?? ""}
          onChange={handleMinPrice}
          className="h-9 w-20 text-sm"
          min={0}
        />
        <span className="text-brand-400">–</span>
        <Input
          type="number"
          placeholder="Max $"
          defaultValue={searchParams.get("maxPrice") ?? ""}
          onChange={handleMaxPrice}
          className="h-9 w-20 text-sm"
          min={0}
        />
      </div>

      {/* Clear all */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClear}
        className="text-brand-500"
      >
        Clear
      </Button>
    </div>
  );
}
