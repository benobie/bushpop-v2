// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpResponse, http } from "msw";
import { server } from "@/test/msw/server";
import { getSellDraftStorageKey } from "@/lib/sell/resume";
import {
  resetSellDraftStoreForTests,
  useSellDraftStore,
} from "@/lib/sell/store";
import type { SellDraft } from "@/lib/sell/types";
import {
  ReviewStep,
  computePublishGateMissing,
} from "../review-step";

const { apiOrigin, trackMock } = vi.hoisted(() => ({
  apiOrigin: "http://localhost",
  trackMock: vi.fn(),
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

  function buildUrl(pathname: string, id?: string) {
    return `${apiOrigin}${id ? pathname.replace("{id}", id) : pathname}`;
  }

  return {
    createBrowserApiClient() {
      return {
        async POST(
          pathname: string,
          options?: { body?: unknown; params?: { path: { id: string } } },
        ) {
          const response = await fetch(buildUrl(pathname, options?.params?.path.id), {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/json",
              "x-requested-with": "XMLHttpRequest",
            },
            body: options?.body ? JSON.stringify(options.body) : undefined,
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

vi.mock("@/lib/analytics", () => ({
  track: trackMock,
}));

const PUBLISH_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/publish$/;
const DUPLICATE_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/duplicate$/;

function buildDraft(overrides: Partial<SellDraft> = {}): SellDraft {
  return {
    id: "01J0SELLDRAFT00000000000000",
    version: 7,
    lifecycleState: "owned",
    title: "Arc'teryx Beta AR jacket",
    brand: "Arc'teryx",
    categoryId: "cat-jackets",
    category: {
      id: "cat-jackets",
      slug: "jackets",
      name: "Jackets",
      parentId: "cat-outerwear",
      parentSlug: "outerwear",
    },
    size: "M",
    sizeScale: "alpha",
    colour: "Black",
    gender: null,
    description:
      "Gore-Tex shell in excellent condition with pit zips, storm hood and clean cuffs.",
    condition: "Excellent",
    conditionNotes: "No stains, holes or seam peel.",
    measurements: {
      chest: 56,
      length: 70,
    },
    measurementTemplate: {
      key: "tops",
      keys: ["chest", "length"],
      sizeExempt: false,
    },
    askingPriceCents: 20_000,
    rrpCents: 36_000,
    shippingOption: "prepaid",
    parcelSize: "medium",
    shippingClass: "m",
    images: [
      {
        id: "img-primary",
        url: "https://example.com/primary.jpg",
        contentType: "image/jpeg",
        sizeBytes: 123_456,
        status: "ready",
        position: 0,
        isPrimary: true,
        confirmedAt: "2026-07-04T00:00:00.000Z",
        createdAt: "2026-07-04T00:00:00.000Z",
        thumbUrl: "https://example.com/primary-thumb.jpg",
      },
    ],
    strength: {
      score: 92,
      band: "excellent",
      breakdown: {
        photos: 20,
        title: 10,
        brand: 5,
        category: 10,
        size: 10,
        colour: 5,
        description: 10,
        condition: 10,
        measurements: 10,
        price: 10,
        rrp: 2,
        offers: 0,
      },
      missing: [
        {
          key: "offers",
          label: "Switch on offers",
          step: 3,
          points: 2,
        },
      ],
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
    updatedAt: "2026-07-04T00:10:00.000Z",
    ...overrides,
  };
}

function renderReviewStep(overrides: Partial<SellDraft> = {}) {
  const flush = vi.fn().mockResolvedValue(undefined);
  const draft = buildDraft(overrides);

  useSellDraftStore.setState({
    draft,
    wizardMeta: {
      startedAt: Date.now() - 5 * 60 * 1000,
      resumed: false,
    },
    flush,
  });

  render(<ReviewStep />);

  return { draft, flush };
}

async function checkLegalAgree() {
  fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/sell?step=review");
  localStorage.clear();
  resetSellDraftStoreForTests();
  trackMock.mockClear();

  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });

  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

describe("computePublishGateMissing", () => {
  it("matches the server gate for complete, missing-photo, size-exempt bag, and low-prepaid fixtures", () => {
    expect(computePublishGateMissing(buildDraft(), true)).toEqual([]);

    expect(
      computePublishGateMissing(
        buildDraft({
          images: [],
        }),
        true,
      ),
    ).toEqual(["photos"]);

    expect(
      computePublishGateMissing(
        buildDraft({
          category: {
            id: "cat-crossbody",
            slug: "crossbody",
            name: "Crossbody bags",
            parentId: "cat-bags",
            parentSlug: "bags",
          },
          size: null,
          measurementTemplate: {
            key: "bags",
            keys: ["width", "height"],
            sizeExempt: true,
          },
          measurements: {
            width: 24,
            height: 18,
          },
          shippingOption: "pickup",
          parcelSize: null,
          shippingClass: null,
        }),
        true,
      ),
    ).toEqual([]);

    expect(
      computePublishGateMissing(
        buildDraft({
          askingPriceCents: 100,
          shippingOption: "prepaid",
          parcelSize: "medium",
          shippingClass: "m",
        }),
        true,
      ),
    ).toEqual(["price_too_low"]);
  });
});

describe("ReviewStep", () => {
  it("keeps publish disabled until legal agree is checked", async () => {
    renderReviewStep();

    const publishButton = screen.getByRole("button", { name: "Publish" });
    expect(publishButton).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => {
      expect(publishButton).toBeEnabled();
    });
  });

  it("wobbles, scrolls, and toasts on a gated publish click without calling the endpoint", async () => {
    const publishBodies: unknown[] = [];
    const scrollMock = vi.mocked(HTMLElement.prototype.scrollIntoView);

    server.use(
      http.post(PUBLISH_URL, async ({ request }) => {
        publishBodies.push(await request.json());
        return HttpResponse.json({});
      }),
    );

    renderReviewStep({
      images: [],
    });
    fireEvent.click(screen.getByRole("checkbox"));

    fireEvent.click(screen.getByTestId("publish-wrap"));

    expect(screen.getByTestId("review-checklist")).toHaveClass("wobble");
    expect(scrollMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Almost - tick off the red items first",
    );
    expect(publishBodies).toHaveLength(0);
  });

  it("flushes before publish, clears the local draft snapshot, and shows the success state", async () => {
    const publishBodies: Array<Record<string, unknown>> = [];
    const callOrder: string[] = [];
    const { draft, flush } = renderReviewStep();

    flush.mockImplementation(async () => {
      callOrder.push("flush");
    });

    localStorage.setItem(
      getSellDraftStorageKey(draft.id),
      JSON.stringify({
        draft,
        wizardMeta: { startedAt: Date.now() - 5 * 60 * 1000, resumed: false },
      }),
    );

    server.use(
      http.post(PUBLISH_URL, async ({ request }) => {
        callOrder.push("publish");
        publishBodies.push(await request.json() as Record<string, unknown>);

        return HttpResponse.json({
          listingId: "listing_123",
          handle: "arcteryx-beta-ar-jacket",
          itemId: draft.id,
          strength: {
            score: 92,
            band: "excellent",
            breakdown: {
              photos: 20,
            },
            version: "v3",
          },
        });
      }),
    );

    await checkLegalAgree();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await screen.findByText("Your listing is live");

    expect(callOrder).toEqual(["flush", "publish"]);
    expect(publishBodies).toEqual([
      {
        version: 7,
        legalAgree: true,
      },
    ]);
    expect(localStorage.getItem(getSellDraftStorageKey(draft.id))).toBeNull();
    expect(screen.getByText(/92\/100/)).toBeInTheDocument();
    expect(screen.getByText(/Strength locked at/)).toHaveTextContent("(Excellent)");
  });

  it("surfaces the server's authoritative missing[] labels on a 422 publish response", async () => {
    server.use(
      http.post(PUBLISH_URL, () =>
        HttpResponse.json(
          {
            error: "PUBLISH_NOT_READY",
            message: "Listing is not ready to publish",
            missing: ["photos", "price_too_low"],
          },
          { status: 422 },
        ),
      ),
    );

    renderReviewStep();
    await checkLegalAgree();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Server still needs: Add at least 1 ready photo, Keep prepaid payout above $0.00",
      );
    });
  });

  it("duplicates from the success state when List another is clicked", async () => {
    const duplicateCalls: string[] = [];

    server.use(
      http.post(PUBLISH_URL, () =>
        HttpResponse.json({
          listingId: "listing_123",
          handle: "arcteryx-beta-ar-jacket",
          itemId: "01J0SELLDRAFT00000000000000",
          strength: {
            score: 92,
            band: "excellent",
            breakdown: {
              photos: 20,
            },
            version: "v3",
          },
        }),
      ),
      http.post(DUPLICATE_URL, ({ request }) => {
        duplicateCalls.push(request.url);

        return HttpResponse.json(
          buildDraft({
            id: "01J0NEXTDRAFT0000000000000",
            title: null,
            description: null,
            askingPriceCents: null,
            rrpCents: null,
            images: [],
            measurements: null,
            size: null,
          }),
          { status: 201 },
        );
      }),
    );

    renderReviewStep();
    await checkLegalAgree();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await screen.findByText("Your listing is live");

    fireEvent.click(screen.getByRole("button", { name: "List another" }));

    await waitFor(() => {
      expect(duplicateCalls).toHaveLength(1);
    });
  });

  it("tracks publish analytics with ready-photo count and AI kept/edited diffs", async () => {
    const now = new Date("2026-07-04T00:10:00.000Z").getTime();
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    server.use(
      http.post(PUBLISH_URL, () =>
        HttpResponse.json({
          listingId: "listing_analytics",
          handle: "arcteryx-beta-ar-jacket",
          itemId: "01J0SELLDRAFT00000000000000",
          strength: {
            score: 92,
            band: "excellent",
            breakdown: {
              photos: 20,
            },
            version: "v3",
          },
        }),
      ),
    );

    renderReviewStep({
      title: "AI title",
      aiTitle: "AI title",
      brand: "Seller brand",
      aiSuggestedBrand: "AI brand",
      category: {
        id: "cat-jackets",
        slug: "jackets",
        name: "Jackets",
        parentId: "cat-outerwear",
        parentSlug: "outerwear",
      },
      aiSuggestedCategory: "jackets",
      colour: "Black",
      aiSuggestedColour: "Black",
      description: "Seller edited description",
      aiDescription: "AI description",
      images: [
        buildDraft().images[0],
        {
          ...buildDraft().images[0],
          id: "img-processing",
          status: "processing",
          isPrimary: false,
          position: 1,
        },
      ],
    });

    await checkLegalAgree();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await screen.findByText("Your listing is live");

    expect(trackMock).toHaveBeenCalledWith({
      event: "wizard.ai_draft_kept",
      props: {
        channel: "bushpop",
        field: "title",
      },
    });
    expect(trackMock).toHaveBeenCalledWith({
      event: "wizard.ai_draft_edited",
      props: {
        channel: "bushpop",
        field: "brand",
      },
    });
    expect(trackMock).toHaveBeenCalledWith({
      event: "wizard.published",
      props: {
        channel: "bushpop",
        listing_id: "listing_analytics",
        strength: 92,
        time_to_list_ms: 5 * 60 * 1000,
        photo_count: 1,
        ai_used: true,
      },
    });

    dateNowSpy.mockRestore();
  });
});
