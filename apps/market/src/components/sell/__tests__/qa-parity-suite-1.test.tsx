// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { computeListingStrength, parcelToShippingClass, strengthBand } from "@bushpop/config";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetSellDraftStoreForTests,
  useSellDraftStore,
} from "@/lib/sell/store";
import type { SellDraft } from "@/lib/sell/types";
import { server } from "@/test/msw/server";
import { SellWizard } from "../sell-wizard";
import { WizardAside } from "../wizard-aside";

const { apiOrigin } = vi.hoisted(() => ({
  apiOrigin: "http://localhost",
}));

vi.mock("browser-image-compression", () => ({
  default: vi.fn(async (file: File, options?: { fileType?: string }) =>
    new File([new Uint8Array([1, 2, 3, 4])], file.name, {
      type: options?.fileType ?? file.type ?? "image/jpeg",
    })),
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

  function replacePathParams(pathname: string, params: Record<string, string> = {}) {
    return pathname.replace(/\{([^}]+)\}/g, (_match, key) => params[key] ?? `{${key}}`);
  }

  async function buildResult(response: Response) {
    const json = await parseJson(response);

    return response.ok
      ? { data: json, response }
      : { error: json, response };
  }

  return {
    createBrowserApiClient() {
      return {
        async GET(pathname: string, options: { params: { path: Record<string, string> } }) {
          const response = await fetch(
            `${apiOrigin}${replacePathParams(pathname, options.params.path)}`,
            {
              method: "GET",
              credentials: "include",
              headers: {
                "x-requested-with": "XMLHttpRequest",
              },
            },
          );

          return buildResult(response);
        },
        async POST(
          pathname: string,
          options?: {
            body?: unknown;
            params?: { path?: Record<string, string> };
          },
        ) {
          const response = await fetch(
            `${apiOrigin}${replacePathParams(pathname, options?.params?.path)}`,
            {
              method: "POST",
              credentials: "include",
              headers: {
                "content-type": "application/json",
                "x-requested-with": "XMLHttpRequest",
              },
              body: options?.body ? JSON.stringify(options.body) : undefined,
            },
          );

          return buildResult(response);
        },
        async PATCH(
          pathname: string,
          options: { body: unknown; params: { path: Record<string, string> } },
        ) {
          const response = await fetch(
            `${apiOrigin}${replacePathParams(pathname, options.params.path)}`,
            {
              method: "PATCH",
              credentials: "include",
              headers: {
                "content-type": "application/json",
                "x-requested-with": "XMLHttpRequest",
              },
              body: JSON.stringify(options.body),
            },
          );

          return buildResult(response);
        },
        async DELETE(pathname: string, options: { params: { path: Record<string, string> } }) {
          const response = await fetch(
            `${apiOrigin}${replacePathParams(pathname, options.params.path)}`,
            {
              method: "DELETE",
              credentials: "include",
              headers: {
                "x-requested-with": "XMLHttpRequest",
              },
            },
          );

          return buildResult(response);
        },
      };
    },
  };
});

const API_ORIGIN = apiOrigin;
const DRAFT_ID = "01J0SELLDRAFT00000000000000";
const AI_JOB_ID = "01J0AIDRAFTJOB0000000000000";
const DRAFTS_URL = `${API_ORIGIN}/api/v1/seller/drafts`;
const DRAFT_URL = /\/api\/v1\/seller\/drafts\/[^/]+$/;
const DETAILS_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/details$/;
const CONDITION_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/condition$/;
const PRICE_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/price$/;
const SHIPPING_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/shipping$/;
const CATEGORIES_URL = /\/api\/v1\/store\/categories(?:\?.*)?$/;
const UPLOAD_URL_REQUEST = /\/api\/v1\/seller\/drafts\/[^/]+\/images\/upload-url$/;
const UPLOAD_PUT_URL = /\/uploads\/[^/]+$/;
const CONFIRM_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/images\/[^/]+\/confirm$/;
const AI_DRAFT_REQUEST_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/ai-draft$/;
const AI_DRAFT_STATUS_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/ai-draft\/[^/]+$/;

const TOPS_PARENT = {
  id: "01JPARENTTOPS0000000000000",
  name: "Tops",
  slug: "tops",
  parentId: null,
  channelId: null,
};

const TOPS_TSHIRTS = {
  id: "01JPLEAFTOPS00000000000000",
  name: "T-Shirts",
  slug: "t-shirts",
  parentId: TOPS_PARENT.id,
  channelId: null,
};

const ALL_CATEGORIES = [TOPS_PARENT, TOPS_TSHIRTS] as const;

type ConditionMeasurements =
  NonNullable<Parameters<ReturnType<typeof useSellDraftStore.getState>["patchCondition"]>[0]["measurements"]>;

let currentDraft = buildDraft();
let nextImageId = 1;

// Referenced existing coverage: AI fill and AI-chip clear parity already live in details-step-ai-reveal.test.tsx.
// Referenced existing coverage: quick-add chip append/used-state parity already lives in details-step.test.tsx.
// Referenced existing coverage: category-to-measurement-template switching parity already lives in condition-step.test.tsx.
// Referenced existing coverage: $200 -> $185.25 payout parity and the 10%-comparison line already live in price-step.test.tsx and listing-strength-parity.test.ts.
// Referenced existing coverage: review gating, buyer preview, and publish success already live in review-step.test.tsx.
// Referenced existing coverage: resume-banner hydrate and step-restore parity already live in sell-wizard.test.tsx.
// Day-1 skip: `pviz` prototype histogram/comps visualisation is intentionally out of scope here.
// Day-1 skip: offers-toggle prototype behaviour is intentionally out of scope here.
// Day-1 skip: badges prototype behaviour is intentionally out of scope here.
// Day-1 skip: XP/streak/progression prototype behaviour is intentionally out of scope here.
// Day-1 skip: auto-enhance photo cleanup prototype behaviour is intentionally out of scope here.
// Day-1 skip: crosslisting prototype behaviour is intentionally out of scope here.

function buildImage(
  overrides: Partial<SellDraft["images"][number]> = {},
): SellDraft["images"][number] {
  return {
    id: `01J0IMAGE0000000000000000${nextImageId}`,
    url: `https://images.example/original-${nextImageId}.jpg`,
    thumbUrl: `https://images.example/thumb-${nextImageId}.webp`,
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

function buildMeasurements(
  overrides: Partial<ConditionMeasurements> = {},
): ConditionMeasurements {
  return {
    chest: 0,
    waist: 0,
    hip: 0,
    length: 0,
    inseam: 0,
    rise: 0,
    shoulder: 0,
    sleeve: 0,
    leg_opening: 0,
    insole: 0,
    width: 0,
    height: 0,
    strap_drop: 0,
    depth: 0,
    ...overrides,
  } as ConditionMeasurements;
}

function buildDraft(overrides: Partial<SellDraft> = {}): SellDraft {
  const draft = {
    id: DRAFT_ID,
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
  } satisfies SellDraft;

  const strength = computeListingStrength({
    photoCount: draft.images.filter((image) => image.status === "ready").length,
    title: draft.title,
    brand: draft.brand,
    categoryLeaf: draft.category?.slug ?? null,
    size: draft.size,
    sizeExempt: draft.measurementTemplate.sizeExempt,
    colour: draft.colour,
    description: draft.description,
    condition: draft.condition,
    hasMeasurements: Object.values(draft.measurements ?? {}).some(
      (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
    ),
    priceCents: draft.askingPriceCents,
    rrpCents: draft.rrpCents,
    offersEnabled: false,
  });

  return {
    ...draft,
    strength: {
      score: strength.score,
      band: strengthBand(strength.score),
      breakdown: strength.breakdown,
      missing: strength.missing,
      version: "v3",
    },
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

  return {
    id: leaf.id,
    slug: leaf.slug,
    name: leaf.name,
    parentId: TOPS_PARENT.id,
    parentSlug: TOPS_PARENT.slug,
  };
}

function updateDraft(patch: Partial<SellDraft>) {
  currentDraft = buildDraft({
    ...currentDraft,
    ...patch,
    version: currentDraft.version + 1,
    updatedAt: "2026-07-04T00:10:00.000Z",
  });
}

function installDraftHandlers() {
  server.use(
    http.get(CATEGORIES_URL, ({ request }) => {
      const parentId = new URL(request.url).searchParams.get("parentId");
      const items = ALL_CATEGORIES.filter((item) =>
        parentId ? item.parentId === parentId : item.parentId === null,
      );

      return HttpResponse.json({ items });
    }),
    http.post(DRAFTS_URL, () => {
      currentDraft = buildDraft();
      return HttpResponse.json(currentDraft);
    }),
    http.get(DRAFT_URL, () => HttpResponse.json(currentDraft)),
    http.patch(DETAILS_URL, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      const nextCategoryId =
        "categoryId" in body ? (body.categoryId as string | null) : currentDraft.categoryId;

      updateDraft({
        title: "title" in body ? (body.title as string | null) : currentDraft.title,
        brand: "brand" in body ? (body.brand as string | null) : currentDraft.brand,
        categoryId: nextCategoryId,
        category: resolveCategory(nextCategoryId),
        size: "size" in body ? (body.size as string | null) : currentDraft.size,
        sizeScale:
          "sizeScale" in body
            ? (body.sizeScale as SellDraft["sizeScale"])
            : currentDraft.sizeScale,
        colour: "colour" in body ? (body.colour as string | null) : currentDraft.colour,
        description:
          "description" in body
            ? (body.description as string | null)
            : currentDraft.description,
      });

      return HttpResponse.json(currentDraft);
    }),
    http.patch(CONDITION_URL, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;

      updateDraft({
        condition:
          "condition" in body
            ? (body.condition as SellDraft["condition"])
            : currentDraft.condition,
        conditionNotes:
          "conditionNotes" in body
            ? (body.conditionNotes as string | null)
            : currentDraft.conditionNotes,
        measurements:
          "measurements" in body
            ? (body.measurements as SellDraft["measurements"])
            : currentDraft.measurements,
      });

      return HttpResponse.json(currentDraft);
    }),
    http.patch(PRICE_URL, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;

      updateDraft({
        askingPriceCents:
          "askingPriceCents" in body
            ? (body.askingPriceCents as number | null)
            : currentDraft.askingPriceCents,
        rrpCents:
          "rrpCents" in body ? (body.rrpCents as number | null) : currentDraft.rrpCents,
      });

      return HttpResponse.json(currentDraft);
    }),
    http.patch(SHIPPING_URL, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      const shippingOption =
        "shippingOption" in body
          ? (body.shippingOption as SellDraft["shippingOption"])
          : currentDraft.shippingOption;
      const parcelSize =
        "parcelSize" in body
          ? (body.parcelSize as SellDraft["parcelSize"])
          : currentDraft.parcelSize;

      updateDraft({
        shippingOption,
        parcelSize,
        shippingClass:
          shippingOption === "pickup" || parcelSize === null
            ? null
            : parcelToShippingClass(parcelSize as "small" | "medium" | "large"),
      });

      return HttpResponse.json(currentDraft);
    }),
    http.post(UPLOAD_URL_REQUEST, () => {
      const imageId = `01J0IMAGEUPLOAD000000000000${nextImageId}`;

      return HttpResponse.json({
        imageId,
        uploadUrl: `${API_ORIGIN}/uploads/${imageId}`,
      });
    }),
    http.put(UPLOAD_PUT_URL, () => new HttpResponse(null, { status: 200 })),
    http.post(CONFIRM_URL, async ({ request }) => {
      const url = new URL(request.url);
      const imageId = url.pathname.split("/").at(-2) ?? `01J0IMAGEUPLOAD000000000000${nextImageId}`;
      const body = await request.json() as {
        position: number;
        isPrimary: boolean;
      };

      const confirmedImage = buildImage({
        id: imageId,
        position: body.position,
        isPrimary: body.isPrimary,
      });

      nextImageId += 1;
      updateDraft({
        images: [...currentDraft.images, confirmedImage].sort(
          (left, right) => left.position - right.position,
        ),
      });

      return HttpResponse.json(confirmedImage);
    }),
    http.post(AI_DRAFT_REQUEST_URL, () =>
      HttpResponse.json(
        {
          jobId: AI_JOB_ID,
          status: "pending",
        },
        { status: 202 },
      )),
    http.get(AI_DRAFT_STATUS_URL, () =>
      HttpResponse.json({
        jobId: AI_JOB_ID,
        status: "completed",
        trigger: "auto",
        suggestions: {
          title: "",
          brand: "",
          categoryLeaf: "",
          colour: "",
          description: "",
          confidence: 0.82,
        },
        confidence: 0.82,
        createdAt: "2026-07-04T00:00:00.000Z",
        completedAt: "2026-07-04T00:00:02.000Z",
      })),
  );
}

function createCheckerboardData() {
  const data = new Uint8ClampedArray(64 * 64 * 4);

  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const offset = ((y * 64) + x) * 4;
      const value = (x + y) % 2 === 0 ? 0 : 255;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }

  return data;
}

function installBrowserStubs() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:qa-photo"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
    configurable: true,
    value: vi.fn((type?: string) => `data:${type ?? "image/png"};base64,stub`),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        width: 64,
        height: 64,
        data: createCheckerboardData(),
      })),
    })),
  });

  class MockImage {
    naturalWidth = 1400;
    naturalHeight = 1800;
    onload: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    #src = "";

    set src(value: string) {
      this.#src = value;
      queueMicrotask(() => {
        this.onload?.(new Event("load"));
      });
    }

    get src() {
      return this.#src;
    }
  }

  vi.stubGlobal("Image", MockImage as unknown as typeof Image);
}

function activeStepLabel(container: HTMLElement): string | null {
  return container.querySelector(".step[aria-current='step'] .label")?.textContent ?? null;
}

function expectProgress(
  container: HTMLElement,
  label: string,
  doneCount: number,
  width: string,
) {
  expect(activeStepLabel(container)).toBe(label);
  expect(container.querySelectorAll(".step.done")).toHaveLength(doneCount);
  expect(container.querySelector(".progressline i")).toHaveStyle({ width });
}

function reviewEditButton(label: string) {
  const row = Array.from(document.querySelectorAll(".ritem")).find(
    (item) => item.querySelector(".k")?.textContent === label,
  );
  if (!(row instanceof HTMLElement)) {
    throw new Error(`Expected review row for ${label}`);
  }

  return within(row).getByRole("button", { name: "Edit" });
}

async function waitForDraftHydration() {
  await waitFor(() => {
    expect(useSellDraftStore.getState().draft?.id).toBe(DRAFT_ID);
  });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/sell");
  localStorage.clear();
  resetSellDraftStoreForTests();
  currentDraft = buildDraft();
  nextImageId = 1;
  installBrowserStubs();
  installDraftHandlers();
});

afterEach(async () => {
  await useSellDraftStore.getState().flush();
  resetSellDraftStoreForTests();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("prototype QA parity integration gaps", () => {
  it("clicks through the full wizard and advances the real stepper/progress line end to end", async () => {
    const { container } = render(<SellWizard existingDraft={null} initialDraftId={null} />);

    await waitForDraftHydration();
    expectProgress(container, "Photos", 0, "0%");

    const browseInput = container.querySelector("input[type='file'][multiple]");
    if (!(browseInput instanceof HTMLInputElement)) {
      throw new Error("Expected the photo browse input");
    }

    fireEvent.change(browseInput, {
      target: {
        files: [new File([new Uint8Array([1, 2, 3])], "cover.jpg", { type: "image/jpeg" })],
      },
    });

    await screen.findByRole("img", { name: "Listing photo 1" });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => {
      expectProgress(container, "Details", 1, "20%");
    });

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "adidas blue tee" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /brand/i }), {
      target: { value: "adidas" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Blue" }));
    fireEvent.click(screen.getByRole("button", { name: "Tops" }));
    fireEvent.click(await screen.findByRole("button", { name: "T-Shirts" }));
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.change(screen.getByLabelText(/^Description/), {
      target: {
        value: "Soft cotton tee in very good condition with no stains, holes or stretching.",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => {
      expectProgress(container, "Condition", 2, "40%");
    });

    fireEvent.click(screen.getByText("Good"));
    fireEvent.change(screen.getByLabelText("Length"), {
      target: { value: "70" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => {
      expectProgress(container, "Price", 3, "60%");
    });

    fireEvent.change(screen.getByLabelText(/Asking price/i), {
      target: { value: "120" },
    });
    fireEvent.change(screen.getByLabelText(/Original RRP/i), {
      target: { value: "180" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => {
      expectProgress(container, "Shipping", 4, "80%");
    });

    fireEvent.click(screen.getByRole("button", { name: /Buyer pays postage/i }));
    fireEvent.click(screen.getByRole("button", { name: /Medium \(500g.+2kg\) - \$10\.95/i }));

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => {
      expectProgress(container, "Review", 5, "100%");
    });

    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
  });

  it("jumps back to the right wizard step when a review Edit link is clicked", async () => {
    currentDraft = buildDraft({
      title: "adidas blue tee",
      brand: "adidas",
      categoryId: TOPS_TSHIRTS.id,
      category: resolveCategory(TOPS_TSHIRTS.id),
      size: "M",
      sizeScale: "alpha",
      colour: "Blue",
      description: "Soft cotton tee in very good condition with no stains, holes or stretching.",
      condition: "good",
      measurements: buildMeasurements({
        length: 70,
      }),
      askingPriceCents: 12_000,
      rrpCents: 18_000,
      shippingOption: "buyer_pays",
      parcelSize: "medium",
      shippingClass: "m",
      images: [buildImage()],
    });

    window.history.replaceState({}, "", "/sell?step=review");

    const { container } = render(<SellWizard existingDraft={null} initialDraftId={currentDraft.id} />);

    await waitForDraftHydration();
    await waitFor(() => {
      expectProgress(container, "Review", 5, "100%");
    });

    fireEvent.click(reviewEditButton("Shipping"));

    await waitFor(() => {
      expect(window.location.search).toBe("?step=shipping");
      expectProgress(container, "Shipping", 4, "80%");
    });
  });

  it("updates the aside score live as the shared draft store gains more completed fields", async () => {
    currentDraft = buildDraft();
    useSellDraftStore.getState().hydrate(currentDraft, {
      startedAt: Date.now(),
      resumed: false,
    });

    const { container } = render(<WizardAside />);

    expect(container.querySelector(".snum")).toHaveTextContent("0");

    act(() => {
      useSellDraftStore.getState().patchDetails(
        {
          title: "adidas blue tee",
          brand: "adidas",
          categoryId: TOPS_TSHIRTS.id,
          size: "M",
          sizeScale: "alpha",
          colour: "Blue",
          description: "Soft cotton tee in very good condition with no stains, holes or stretching.",
        },
        { immediate: true },
      );
    });
    await useSellDraftStore.getState().flush();

    const scoreAfterDetails = Number.parseInt(
      container.querySelector(".snum")?.textContent ?? "0",
      10,
    );
    expect(scoreAfterDetails).toBeGreaterThan(0);

    act(() => {
      useSellDraftStore.getState().patchCondition(
        {
          condition: "good",
          measurements: buildMeasurements({
            length: 70,
          }),
        },
        { immediate: true },
      );
      useSellDraftStore.getState().patchPrice(
        {
          askingPriceCents: 12_000,
          rrpCents: 18_000,
        },
        { immediate: true },
      );
    });
    await useSellDraftStore.getState().flush();

    const scoreAfterPrice = Number.parseInt(
      container.querySelector(".snum")?.textContent ?? "0",
      10,
    );
    expect(scoreAfterPrice).toBeGreaterThan(scoreAfterDetails);
  });
});
