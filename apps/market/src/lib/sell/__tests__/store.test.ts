import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpResponse, http } from "msw";
import { server } from "@/test/msw/server";
import {
  resetSellDraftStoreForTests,
  useSellDraftStore,
} from "../store";
import type { SellDraft } from "../types";

const { apiOrigin } = vi.hoisted(() => ({
  apiOrigin: "http://localhost",
}));

vi.mock("@bushpop/api-client/browser", () => {
  async function parseJson(response: Response) {
    if (response.status === 204) {
      return undefined;
    }

    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  function buildUrl(pathname: string, id: string) {
    return `${apiOrigin}${pathname.replace("{id}", id)}`;
  }

  return {
    createBrowserApiClient() {
      return {
        async GET(pathname: string, options: { params: { path: { id: string } } }) {
          const response = await fetch(buildUrl(pathname, options.params.path.id), {
            method: "GET",
            credentials: "include",
            headers: {
              "x-requested-with": "XMLHttpRequest",
            },
          });
          const json = await parseJson(response);

          return response.ok
            ? { data: json, response }
            : { error: json, response };
        },
        async PATCH(
          pathname: string,
          options: { body: unknown; params: { path: { id: string } } },
        ) {
          const response = await fetch(buildUrl(pathname, options.params.path.id), {
            method: "PATCH",
            credentials: "include",
            headers: {
              "content-type": "application/json",
              "x-requested-with": "XMLHttpRequest",
            },
            body: JSON.stringify(options.body),
          });
          const json = await parseJson(response);

          return response.ok
            ? { data: json, response }
            : { error: json, response };
        },
      };
    },
  };
});

const API_ORIGIN = apiOrigin;
const DETAILS_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/details$/;
const PRICE_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/price$/;
const DRAFT_URL = /\/api\/v1\/seller\/drafts\/[^/]+$/;

function buildDraft(overrides: Partial<SellDraft> = {}): SellDraft {
  return {
    id: "01J0SELLDRAFT00000000000000",
    version: 1,
    lifecycleState: "owned",
    title: null,
    brand: null,
    categoryId: null,
    category: null,
    size: null,
    sizeScale: null,
    colour: null,
    gender: null,
    description: null,
    condition: null,
    conditionNotes: null,
    measurements: null,
    measurementTemplate: {
      key: "tops",
      keys: ["chest", "length"],
      sizeExempt: false,
    },
    askingPriceCents: null,
    rrpCents: null,
    shippingOption: null,
    parcelSize: null,
    shippingClass: null,
    images: [],
    strength: {
      score: 0,
      band: "low",
      breakdown: {},
      missing: [],
      version: "v3",
    },
    aiTitle: null,
    aiDescription: null,
    aiSuggestedBrand: null,
    aiSuggestedCategory: null,
    aiSuggestedColour: null,
    aiSuggestedGender: null,
    aiConfidence: null,
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    ...overrides,
  };
}

function cloneDraft(draft: SellDraft): SellDraft {
  return structuredClone(draft);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState({}, "", "/sell");
  localStorage.clear();
  resetSellDraftStoreForTests();
});

describe("sell draft sync store", () => {
  it("coalesces rapid debounced edits into one PATCH after 800ms", async () => {
    const initialDraft = buildDraft();
    const patchBodies: Array<Record<string, unknown>> = [];

    server.use(
      http.patch(DETAILS_URL, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        patchBodies.push(body);

        return HttpResponse.json(buildDraft({
          version: 2,
          title: body.title as string,
        }));
      }),
    );

    useSellDraftStore.getState().hydrate(initialDraft, {
      startedAt: Date.now(),
      resumed: false,
    });

    useSellDraftStore.getState().patchDetails({ title: "S" });
    useSellDraftStore.getState().patchDetails({ title: "Sk" });
    useSellDraftStore.getState().patchDetails({ title: "Skirt" });

    await vi.advanceTimersByTimeAsync(799);
    expect(patchBodies).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    await useSellDraftStore.getState().flush();

    expect(patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toEqual({
      version: 1,
      title: "Skirt",
    });
    expect(useSellDraftStore.getState().draft?.title).toBe("Skirt");
    expect(useSellDraftStore.getState().draft?.version).toBe(2);
  });

  it("fires immediate edits without waiting for the debounce window", async () => {
    const initialDraft = buildDraft();
    const patchBodies: Array<Record<string, unknown>> = [];

    server.use(
      http.patch(PRICE_URL, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        patchBodies.push(body);

        return HttpResponse.json(buildDraft({
          version: 2,
          askingPriceCents: body.askingPriceCents as number,
        }));
      }),
    );

    useSellDraftStore.getState().hydrate(initialDraft, {
      startedAt: Date.now(),
      resumed: false,
    });

    useSellDraftStore.getState().patchPrice(
      { askingPriceCents: 12_500 },
      { immediate: true },
    );

    await useSellDraftStore.getState().flush();

    expect(patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toEqual({
      version: 1,
      askingPriceCents: 12_500,
    });
  });

  it("serializes overlapping step edits through one global in-flight queue", async () => {
    const initialDraft = buildDraft();
    const detailsRelease = deferred<void>();
    const requestOrder: string[] = [];
    const patchBodies: Array<Record<string, unknown>> = [];
    let inFlight = 0;
    let maxConcurrent = 0;

    server.use(
      http.patch(DETAILS_URL, async ({ request }) => {
        inFlight += 1;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        requestOrder.push("details");

        const body = await request.json() as Record<string, unknown>;
        patchBodies.push(body);

        await detailsRelease.promise;
        inFlight -= 1;

        return HttpResponse.json(buildDraft({
          version: 2,
          title: body.title as string,
        }));
      }),
      http.patch(PRICE_URL, async ({ request }) => {
        inFlight += 1;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        requestOrder.push("price");

        const body = await request.json() as Record<string, unknown>;
        patchBodies.push(body);
        inFlight -= 1;

        return HttpResponse.json(buildDraft({
          version: 3,
          title: "Jacket",
          askingPriceCents: body.askingPriceCents as number,
        }));
      }),
    );

    useSellDraftStore.getState().hydrate(initialDraft, {
      startedAt: Date.now(),
      resumed: false,
    });

    useSellDraftStore.getState().patchDetails({ title: "Jacket" }, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);

    useSellDraftStore.getState().patchPrice(
      { askingPriceCents: 9_900 },
      { immediate: true },
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(requestOrder).toEqual(["details"]);
    expect(maxConcurrent).toBe(1);

    detailsRelease.resolve();
    await useSellDraftStore.getState().flush();

    expect(requestOrder).toEqual(["details", "price"]);
    expect(maxConcurrent).toBe(1);
    expect(patchBodies).toEqual([
      { version: 1, title: "Jacket" },
      { version: 2, askingPriceCents: 9_900 },
    ]);
    expect(useSellDraftStore.getState().draft?.version).toBe(3);
  });

  it("keeps a local dirty value through conflict refetch and retry", async () => {
    const baseDraft = buildDraft({
      title: "Base title",
      brand: "Base brand",
    });

    const patchBodies: Array<Record<string, unknown>> = [];
    let detailsCalls = 0;

    server.use(
      http.patch(DETAILS_URL, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        patchBodies.push(body);
        detailsCalls += 1;

        if (detailsCalls === 1) {
          return HttpResponse.json(
            { error: "CONFLICT", message: "Draft was modified by another request." },
            { status: 409 },
          );
        }

        return HttpResponse.json(buildDraft({
          version: 3,
          title: body.title as string,
          brand: "Server brand",
        }));
      }),
      http.get(DRAFT_URL, () => HttpResponse.json(buildDraft({
        version: 2,
        title: "Server title",
        brand: "Server brand",
      }))),
    );

    useSellDraftStore.getState().hydrate(baseDraft, {
      startedAt: Date.now(),
      resumed: false,
    });

    useSellDraftStore.getState().patchDetails(
      { title: "Local title" },
      { immediate: true },
    );

    await useSellDraftStore.getState().flush();

    expect(patchBodies).toEqual([
      { version: 1, title: "Local title" },
      { version: 2, title: "Local title" },
    ]);
    expect(useSellDraftStore.getState().draft?.title).toBe("Local title");
    expect(useSellDraftStore.getState().status).toBe("idle");
  });

  it("persists surviving local edits after giving up on a second conflict", async () => {
    const baseDraft = buildDraft({
      title: "Base title",
      brand: "Base brand",
    });

    const patchBodies: Array<Record<string, unknown>> = [];
    let refetchCalls = 0;

    server.use(
      http.patch(DETAILS_URL, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        patchBodies.push(body);

        return HttpResponse.json(
          { error: "CONFLICT", message: "Draft was modified by another request." },
          { status: 409 },
        );
      }),
      http.get(DRAFT_URL, () => {
        refetchCalls += 1;

        return HttpResponse.json(buildDraft({
          version: refetchCalls === 1 ? 2 : 3,
          title: refetchCalls === 1 ? "Server title" : "Server title again",
          brand: refetchCalls === 1 ? "Server brand" : "Server brand again",
        }));
      }),
    );

    useSellDraftStore.getState().hydrate(baseDraft, {
      startedAt: Date.now(),
      resumed: false,
    });

    useSellDraftStore.getState().patchDetails(
      { title: "Local title" },
      { immediate: true },
    );

    await useSellDraftStore.getState().flush();

    const snapshot = JSON.parse(
      localStorage.getItem(`bushpop_sell_draft:${baseDraft.id}`) ?? "null",
    ) as { draft: SellDraft } | null;

    expect(patchBodies).toEqual([
      { version: 1, title: "Local title" },
      { version: 2, title: "Local title" },
    ]);
    expect(useSellDraftStore.getState().status).toBe("conflict");
    expect(useSellDraftStore.getState().draft?.title).toBe("Local title");
    expect(snapshot?.draft.title).toBe("Local title");
  });

  it("takes untouched fields from the server after a conflict merge", async () => {
    const baseDraft = buildDraft({
      title: "Base title",
      brand: "Base brand",
    });

    let detailsCalls = 0;

    server.use(
      http.patch(DETAILS_URL, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        detailsCalls += 1;

        if (detailsCalls === 1) {
          return HttpResponse.json(
            { error: "CONFLICT", message: "Draft was modified by another request." },
            { status: 409 },
          );
        }

        return HttpResponse.json(buildDraft({
          version: 3,
          title: body.title as string,
          brand: "Server brand",
        }));
      }),
      http.get(DRAFT_URL, () => {
        const serverDraft = cloneDraft(baseDraft);
        serverDraft.version = 2;
        serverDraft.title = "Server title";
        serverDraft.brand = "Server brand";
        return HttpResponse.json(serverDraft);
      }),
    );

    useSellDraftStore.getState().hydrate(baseDraft, {
      startedAt: Date.now(),
      resumed: false,
    });

    useSellDraftStore.getState().patchDetails(
      { title: "Local title" },
      { immediate: true },
    );

    await useSellDraftStore.getState().flush();

    expect(useSellDraftStore.getState().draft?.brand).toBe("Server brand");
    expect(useSellDraftStore.getState().draft?.title).toBe("Local title");
  });
});
