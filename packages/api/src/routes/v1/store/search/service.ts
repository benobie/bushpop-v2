import { AppError } from "../../../../lib/errors.js";
import { getMeiliClient } from "../../../../lib/meilisearch.js";
import { getListingIndexName } from "../../../../lib/search-index.js";
import type { ListingDocument } from "../../../../lib/search-index.js";
import type { BrowseQuery, SearchQuery, ListingPageResponse, StoreListingCard } from "./schemas.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Escape a string value for use in a MeiliSearch filter expression. */
function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Build MeiliSearch filter array from query params. */
function buildFilters(query: BrowseQuery): string[] {
  const filters: string[] = [];

  filters.push("status = active");

  if (query.categorySlug) {
    filters.push(`categorySlug = "${escapeFilterValue(query.categorySlug)}"`);
  }
  if (query.size) {
    filters.push(`size = "${escapeFilterValue(query.size)}"`);
  }
  if (query.colour) {
    filters.push(`colour = "${escapeFilterValue(query.colour)}"`);
  }
  if (query.brand) {
    filters.push(`brand = "${escapeFilterValue(query.brand)}"`);
  }
  if (query.condition) {
    filters.push(`condition = "${escapeFilterValue(query.condition)}"`);
  }
  if (query.minPrice !== undefined) {
    filters.push(`priceCents >= ${query.minPrice}`);
  }
  if (query.maxPrice !== undefined) {
    filters.push(`priceCents <= ${query.maxPrice}`);
  }

  return filters;
}

/** Map sort option to MeiliSearch sort array with stable ULID tiebreaker. */
function buildBrowseSort(sort: BrowseQuery["sort"]): string[] {
  switch (sort) {
    case "price_asc":
      return ["priceCents:asc", "id:desc"];
    case "price_desc":
      return ["priceCents:desc", "id:desc"];
    case "newest":
    default:
      return ["publishedAt:desc", "id:desc"];
  }
}

function buildSearchSort(sort: SearchQuery["sort"]): string[] | undefined {
  switch (sort) {
    case "price_asc":
      return ["priceCents:asc", "id:desc"];
    case "price_desc":
      return ["priceCents:desc", "id:desc"];
    case "newest":
    default:
      return undefined;
  }
}

/** Map a MeiliSearch listing document to the StoreListingCard response shape. */
function toListingCard(doc: ListingDocument): StoreListingCard {
  return {
    id: doc.id,
    title: doc.title,
    handle: doc.handle,
    priceCents: doc.priceCents,
    currency: doc.currency,
    publishedAt: doc.publishedAt,
    primaryImageUrl: doc.primaryImageUrl,
    brand: doc.brand,
    size: doc.size,
    colour: doc.colour,
    condition: doc.condition,
    categorySlug: doc.categorySlug,
    seller: {
      id: doc.seller.id,
      handle: doc.seller.handle,
      storeName: doc.seller.storeName,
      avatarUrl: doc.seller.avatarUrl,
    },
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Browse listings (no text query — filter + sort only).
 * Returns all docs matching filters, paginated via MeiliSearch native offset.
 */
export async function browseListings(query: BrowseQuery, channelSlug: string): Promise<ListingPageResponse> {
  const client = getMeiliClient();
  const indexName = getListingIndexName(channelSlug);
  const index = client.index<ListingDocument>(indexName);

  const filters = buildFilters(query);
  const sort = buildBrowseSort(query.sort);

  try {
    const result = await index.search("", {
      filter: filters,
      sort,
      offset: query.offset,
      limit: query.limit,
    });

    const items = (result.hits as ListingDocument[]).map(toListingCard);
    const total = result.estimatedTotalHits ?? 0;

    return {
      items,
      total,
      offset: query.offset,
      limit: query.limit,
      hasMore: query.offset + items.length < total,
    };
  } catch (err: unknown) {
    throw mapMeiliError(err);
  }
}

/**
 * Full-text search listings (required `q` param + filters).
 */
export async function searchListings(query: SearchQuery, channelSlug: string): Promise<ListingPageResponse> {
  const client = getMeiliClient();
  const indexName = getListingIndexName(channelSlug);
  const index = client.index<ListingDocument>(indexName);

  const filters = buildFilters(query);
  const sort = buildSearchSort(query.sort);

  try {
    const result = await index.search(query.q, {
      filter: filters,
      sort,
      offset: query.offset,
      limit: query.limit,
    });

    const items = (result.hits as ListingDocument[]).map(toListingCard);
    const total = result.estimatedTotalHits ?? 0;

    return {
      items,
      total,
      offset: query.offset,
      limit: query.limit,
      hasMore: query.offset + items.length < total,
    };
  } catch (err: unknown) {
    throw mapMeiliError(err);
  }
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/**
 * Map a MeiliSearch connection error to a 503 AppError.
 * Other errors are re-thrown as-is.
 */
function mapMeiliError(err: unknown): Error {
  if (!err || typeof err !== "object") {
    return new AppError("Search service unavailable", 503, "SEARCH_UNAVAILABLE");
  }

  // Connection errors (ECONNREFUSED, ETIMEDOUT, etc.)
  if ("code" in err) {
    const code = (err as { code: string }).code;
    if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ETIMEDOUT") {
      return new AppError("Search service unavailable", 503, "SEARCH_UNAVAILABLE");
    }
  }

  // MeiliSearch HTTP 5xx
  if ("httpStatus" in err && (err as { httpStatus: number }).httpStatus >= 500) {
    return new AppError("Search service unavailable", 503, "SEARCH_UNAVAILABLE");
  }

  return err as Error;
}
