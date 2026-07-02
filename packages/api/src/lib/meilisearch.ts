import { Meilisearch } from "meilisearch";

let meiliClient: Meilisearch | null = null;

export function getMeiliClient(): Meilisearch {
  if (!meiliClient) {
    const host = process.env.MEILISEARCH_HOST;
    const apiKey = process.env.MEILI_MASTER_KEY;

    if (!host) {
      throw new Error("MEILISEARCH_HOST environment variable is required");
    }

    meiliClient = new Meilisearch({
      host,
      apiKey,
    });
  }
  return meiliClient;
}

/** Reset singleton — used in tests to allow re-initialisation. */
export function resetMeiliClient(): void {
  meiliClient = null;
}
