// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { server } from "@/test/msw/server";
import {
  resetSellDraftStoreForTests,
  useSellDraftStore,
} from "@/lib/sell/store";
import type { SellDraft } from "@/lib/sell/types";
import { DetailsStep } from "../details-step";

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

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  channelId: string | null;
};

const DETAILS_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/details$/;
const CATEGORIES_URL = /\/api\/v1\/store\/categories(?:\?.*)?$/;
const AI_DRAFT_REQUEST_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/ai-draft$/;
const AI_DRAFT_STATUS_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/ai-draft\/[^/]+$/;

const TOPS_PARENT: CategoryItem = {
  id: "01JPARENTTOPS0000000000000",
  name: "Tops",
  slug: "tops",
  parentId: null,
  channelId: null,
};

const TOPS_TSHIRTS: CategoryItem = {
  id: "01JPLEAFTOPS00000000000000",
  name: "T-Shirts",
  slug: "t-shirts",
  parentId: TOPS_PARENT.id,
  channelId: null,
};

const ALL_CATEGORIES = [TOPS_PARENT, TOPS_TSHIRTS] as const;

let currentDraft = buildDraft();

function buildImage(overrides: Partial<SellDraft["images"][number]> = {}): SellDraft["images"][number] {
  return {
    id: "01J0IMAGE000000000000000000",
    url: "https://images.example/original.jpg",
    thumbUrl: "https://images.example/thumb.webp",
    contentType: "image/webp",
    sizeBytes: 120_000,
    status: "ready",
    position: 0,
    isPrimary: true,
    confirmedAt: "2026-07-04T00:00:00.000Z",
    createdAt: "2026-07-04T00:00:00.000Z",
    ...overrides,
  };
}

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
    aiConfidence: null,
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    ...overrides,
  };
}

function resolveCategory(categoryId: string | null | undefined) {
  if (!categoryId) {
    return null;
  }

  const leaf = ALL_CATEGORIES.find((item) => item.id === categoryId) ?? null;
  if (!leaf) {
    return null;
  }

  const parent = ALL_CATEGORIES.find((item) => item.id === leaf.parentId) ?? null;

  return {
    id: leaf.id,
    slug: leaf.slug,
    name: leaf.name,
    parentId: leaf.parentId,
    parentSlug: parent?.slug ?? null,
  };
}

function applyDetailsPatch(body: Record<string, unknown>) {
  const nextCategoryId =
    "categoryId" in body ? (body.categoryId as string | null) : currentDraft.categoryId;

  currentDraft = buildDraft({
    ...currentDraft,
    title: "title" in body ? (body.title as string | null) : currentDraft.title,
    brand: "brand" in body ? (body.brand as string | null) : currentDraft.brand,
    categoryId: nextCategoryId,
    category: resolveCategory(nextCategoryId),
    colour: "colour" in body ? (body.colour as string | null) : currentDraft.colour,
    description:
      "description" in body
        ? (body.description as string | null)
        : currentDraft.description,
    version: currentDraft.version + 1,
  });
}

function renderStep(panelClassName: string, draft: SellDraft = currentDraft) {
  useSellDraftStore.getState().hydrate(draft, {
    startedAt: Date.now(),
    resumed: false,
  });

  return render(
    <div className={panelClassName}>
      <DetailsStep />
    </div>,
  );
}

function setReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/sell?step=details");
  localStorage.clear();
  resetSellDraftStoreForTests();
  setReducedMotion(true);
  currentDraft = buildDraft();

  server.use(
    http.get(CATEGORIES_URL, ({ request }) => {
      const parentId = new URL(request.url).searchParams.get("parentId");
      const items = ALL_CATEGORIES.filter((item) =>
        parentId ? item.parentId === parentId : item.parentId === null,
      );

      return HttpResponse.json({ items });
    }),
    http.patch(DETAILS_URL, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      applyDetailsPatch(body);
      return HttpResponse.json(currentDraft);
    }),
  );
});

afterEach(async () => {
  await useSellDraftStore.getState().flush();
  resetSellDraftStoreForTests();
  vi.unstubAllGlobals();
});

describe("DetailsStep AI reveal", () => {
  it("waits for the details panel to become active before auto-generating from photos", async () => {
    currentDraft = buildDraft({
      images: [buildImage()],
    });

    let aiDraftRequests = 0;

    server.use(
      http.post(AI_DRAFT_REQUEST_URL, () => {
        aiDraftRequests += 1;
        return HttpResponse.json(
          {
            jobId: "01J0AIDRAFTJOB0000000000000",
            status: "pending",
          },
          { status: 202 },
        );
      }),
      http.get(AI_DRAFT_STATUS_URL, () =>
        HttpResponse.json({
          jobId: "01J0AIDRAFTJOB0000000000000",
          status: "completed",
          trigger: "auto",
          suggestions: {
            title: "Nike blue jacket",
            brand: "Nike",
            categoryLeaf: TOPS_TSHIRTS.slug,
            colour: "blue",
            description: "Smoke-free home.",
            confidence: 0.82,
          },
          confidence: 0.82,
          createdAt: "2026-07-04T00:00:00.000Z",
          completedAt: "2026-07-04T00:00:02.000Z",
        })),
    );

    const view = renderStep("panel", currentDraft);

    await screen.findByText("Item details");
    await waitFor(() => {
      expect(aiDraftRequests).toBe(0);
    });

    view.rerender(
      <div className="panel on">
        <DetailsStep />
      </div>,
    );

    await waitFor(() => {
      expect(aiDraftRequests).toBe(1);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/^Title/)).toHaveValue("Nike blue jacket");
      expect(screen.getByRole("combobox", { name: /brand/i })).toHaveValue("Nike");
      expect(screen.getByLabelText(/^Description/)).toHaveValue("Smoke-free home.");
    });

    const categoryButton = await screen.findByRole("button", { name: "T-Shirts" });
    expect(categoryButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Draft ready");
    expect(screen.getByRole("button", { name: /regenerate/i })).toBeInTheDocument();
  });

  it("shows the regenerate limit message when the backend rejects a regenerate request with 429", async () => {
    currentDraft = buildDraft({
      images: [buildImage()],
      title: "Nike blue jacket",
      brand: "Nike",
      categoryId: TOPS_TSHIRTS.id,
      category: resolveCategory(TOPS_TSHIRTS.id),
      colour: "blue",
      description: "Smoke-free home.",
      aiTitle: "Nike blue jacket",
      aiSuggestedBrand: "Nike",
      aiSuggestedCategory: TOPS_TSHIRTS.slug,
      aiSuggestedColour: "blue",
      aiDescription: "Smoke-free home.",
    });

    server.use(
      http.post(AI_DRAFT_REQUEST_URL, () =>
        HttpResponse.json(
          { message: "Too many regenerate attempts." },
          { status: 429 },
        )),
    );

    renderStep("panel on", currentDraft);

    fireEvent.click(await screen.findByRole("button", { name: /regenerate/i }));

    await waitFor(() => {
      expect(
        screen.getByText("You've hit the regenerate limit for this item."),
      ).toBeInTheDocument();
    });
  });
});
