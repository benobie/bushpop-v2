"use client";

/**
 * Client filter bar — sort, condition, brand, price range, plus an active-
 * filter chip row. Syncs state to URL search params via useRouter so the RSC
 * page re-fetches with the new filters server-side (no client-side data
 * fetching needed).
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
import { conditionLabel } from "@/lib/condition-labels";
import { categoryLabel } from "@/lib/category-labels";
import { track } from "@/lib/analytics";
import { DEFAULT_CHANNEL, GENDER_LABELS, type Gender } from "@bushpop/config";
import { SaveSearchButton } from "./save-search-button";

function genderLabel(value: string): string {
  return GENDER_LABELS[value as Gender] ?? value;
}

interface FilterBarProps {
  basePath: "/shop" | "/search";
  /** Current query string (for search page — preserves `q` param) */
  q?: string;
  /** Result counts per filter value from Meili facetDistribution (U1 §2.1). */
  facetDistribution?: Record<string, Record<string, number>>;
}

const FILTER_LABELS: Record<string, string> = {
  categorySlug: "Category",
  size: "Size",
  colour: "Colour",
  brand: "Brand",
  condition: "Condition",
  gender: "Gender",
  minPrice: "Min price",
  maxPrice: "Max price",
};

export function FilterBar({ basePath, q, facetDistribution }: FilterBarProps) {
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
      if (value) {
        track({ event: "browse.filter_applied", props: { channel: DEFAULT_CHANNEL, filter: key, value } });
      }
    },
    [router, searchParams, basePath, q],
  );

  const currentSort = searchParams.get("sort") ?? "";
  const currentCondition = searchParams.get("condition") ?? "";
  const currentBrand = searchParams.get("brand") ?? "";
  const currentGender = searchParams.get("gender") ?? "";

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

  const genderFacets = Object.entries(facetDistribution?.gender ?? {}).sort((a, b) => b[1] - a[1]);
  const categoryFacets = Object.entries(facetDistribution?.categorySlug ?? {}).sort((a, b) => b[1] - a[1]);
  const brandFacets = Object.entries(facetDistribution?.brand ?? {}).sort((a, b) => b[1] - a[1]);
  const sizeFacets = Object.entries(facetDistribution?.size ?? {}).sort((a, b) => b[1] - a[1]);
  const colourFacets = Object.entries(facetDistribution?.colour ?? {}).sort((a, b) => b[1] - a[1]);
  const currentCategory = searchParams.get("categorySlug") ?? "";
  const currentSize = searchParams.get("size") ?? "";
  const currentColour = searchParams.get("colour") ?? "";

  const activeFilters = ["gender", "categorySlug", "size", "colour", "brand", "condition", "minPrice", "maxPrice"]
    .map((key) => ({ key, value: searchParams.get(key) }))
    .filter((f): f is { key: string; value: string } => !!f.value);

  return (
    <div className="space-y-3">
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
            <SelectItem value="new_with_tags">{conditionLabel("new_with_tags")}</SelectItem>
            <SelectItem value="like_new">{conditionLabel("like_new")}</SelectItem>
            <SelectItem value="good">{conditionLabel("good")}</SelectItem>
            <SelectItem value="fair">{conditionLabel("fair")}</SelectItem>
            <SelectItem value="poor">{conditionLabel("poor")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Gender — first-class IA cut (W3), populated from facet counts when available */}
        {genderFacets.length > 0 && (
          <Select value={currentGender} onValueChange={(v) => pushFilter("gender", v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-32 text-sm">
              <SelectValue placeholder="Gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All genders</SelectItem>
              {genderFacets.map(([gender, count]) => (
                <SelectItem key={gender} value={gender}>
                  {genderLabel(gender)} ({count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Category — populated from facet counts when available */}
        {categoryFacets.length > 0 && (
          <Select value={currentCategory} onValueChange={(v) => pushFilter("categorySlug", v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categoryFacets.map(([slug, count]) => (
                <SelectItem key={slug} value={slug}>
                  {categoryLabel(slug)} ({count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Brand — populated from facet counts when available */}
        {brandFacets.length > 0 && (
          <Select value={currentBrand} onValueChange={(v) => pushFilter("brand", v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {brandFacets.map(([brand, count]) => (
                <SelectItem key={brand} value={brand}>
                  {brand} ({count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Size — populated from facet counts when available */}
        {sizeFacets.length > 0 && (
          <Select value={currentSize} onValueChange={(v) => pushFilter("size", v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-32 text-sm">
              <SelectValue placeholder="Size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sizes</SelectItem>
              {sizeFacets.map(([size, count]) => (
                <SelectItem key={size} value={size}>
                  {size} ({count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Colour — populated from facet counts when available */}
        {colourFacets.length > 0 && (
          <Select value={currentColour} onValueChange={(v) => pushFilter("colour", v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-32 text-sm">
              <SelectValue placeholder="Colour" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All colours</SelectItem>
              {colourFacets.map(([colour, count]) => (
                <SelectItem key={colour} value={colour}>
                  {colour} ({count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

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
          <span className="text-bp-ink-3">–</span>
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
          className="text-bp-ink-2"
        >
          Clear
        </Button>
      </div>

      {/* Active-filter chip row */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map(({ key, value }) => (
            <button
              key={key}
              type="button"
              onClick={() => pushFilter(key, "")}
              className="flex items-center gap-1 rounded-full border border-bp-line bg-bp-surface-2 px-3 py-1 text-xs text-bp-ink-2"
            >
              {FILTER_LABELS[key] ?? key}:{" "}
              {key === "condition"
                ? conditionLabel(value)
                : key === "categorySlug"
                  ? categoryLabel(value)
                  : key === "gender"
                    ? genderLabel(value)
                    : value}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <SaveSearchButton q={q} />
    </div>
  );
}
