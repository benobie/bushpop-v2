import { getMeiliClient } from "../../lib/meilisearch.js";
import {
  fetchFullListing,
  buildListingDocument,
  getListingIndexName,
} from "../../lib/search-index.js";

/**
 * Sync a listing to MeiliSearch and wait for the indexing task to complete.
 * Use in integration tests to populate the index before querying.
 */
export async function indexTestListing(
  listingId: string,
  channelSlug: string = "piklo",
): Promise<void> {
  const row = await fetchFullListing(listingId);
  if (!row) {
    throw new Error(`Listing ${listingId} not found — cannot index`);
  }

  const client = getMeiliClient();
  const indexName = getListingIndexName(channelSlug);
  const index = client.index(indexName);
  const doc = buildListingDocument(row);

  await index.addDocuments([doc], { primaryKey: "id" }).waitTask();
}

/**
 * Delete all documents from the listings index and wait for completion.
 * Prevents stale docs from contaminating subsequent tests.
 */
export async function clearListingsIndex(
  channelSlug: string = "piklo",
): Promise<void> {
  const client = getMeiliClient();
  const indexName = getListingIndexName(channelSlug);

  try {
    const index = client.index(indexName);
    await index.deleteAllDocuments().waitTask();
  } catch {
    // Index may not exist yet on first run — silently ignore
  }
}
