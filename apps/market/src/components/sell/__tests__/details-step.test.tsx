// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const TOPS_PARENT: CategoryItem = {
  id: "01JPARENTTOPS0000000000000",
  name: "Tops",
  slug: "tops",
  parentId: null,
  channelId: null,
};

const BOTTOMS_PARENT: CategoryItem = {
  id: "01JPARENTBTMS0000000000000",
  name: "Bottoms",
  slug: "bottoms",
  parentId: null,
  channelId: null,
};

const DRESSES_PARENT: CategoryItem = {
  id: "01JPARENTDRES0000000000000",
  name: "Dresses",
  slug: "dresses",
  parentId: null,
  channelId: null,
};

const FOOTWEAR_PARENT: CategoryItem = {
  id: "01JPARENTSHOE0000000000000",
  name: "Footwear",
  slug: "footwear",
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

const TOPS_SHIRTS: CategoryItem = {
  id: "01JPLEAFSHIR00000000000000",
  name: "Shirts",
  slug: "shirts",
  parentId: TOPS_PARENT.id,
  channelId: null,
};

const BOTTOMS_JEANS: CategoryItem = {
  id: "01JPLEAFJENS00000000000000",
  name: "Jeans",
  slug: "jeans",
  parentId: BOTTOMS_PARENT.id,
  channelId: null,
};

const DRESSES_MIDI: CategoryItem = {
  id: "01JPLEAFMIDI00000000000000",
  name: "Midi Dresses",
  slug: "midi-dresses",
  parentId: DRESSES_PARENT.id,
  channelId: null,
};

const FOOTWEAR_SNEAKERS: CategoryItem = {
  id: "01JPLEAFSNKR00000000000000",
  name: "Sneakers",
  slug: "sneakers",
  parentId: FOOTWEAR_PARENT.id,
  channelId: null,
};

const ALL_CATEGORIES = [
  TOPS_PARENT,
  BOTTOMS_PARENT,
  DRESSES_PARENT,
  FOOTWEAR_PARENT,
  TOPS_TSHIRTS,
  TOPS_SHIRTS,
  BOTTOMS_JEANS,
  DRESSES_MIDI,
  FOOTWEAR_SNEAKERS,
] as const;

const ORIGINAL_PATCH_DETAILS = useSellDraftStore.getState().patchDetails;

let patchDetailsSpy = vi.fn();
let currentDraft = buildDraft();

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
    version: currentDraft.version + 1,
  });
}

function renderStep(draft: SellDraft = currentDraft) {
  useSellDraftStore.getState().hydrate(draft, {
    startedAt: Date.now(),
    resumed: false,
  });

  return render(<DetailsStep />);
}

beforeEach(() => {
  window.history.replaceState({}, "", "/sell");
  localStorage.clear();
  resetSellDraftStoreForTests();
  useSellDraftStore.setState({ patchDetails: ORIGINAL_PATCH_DETAILS });

  currentDraft = buildDraft();
  patchDetailsSpy = vi.fn((patch, opts) => ORIGINAL_PATCH_DETAILS(patch, opts));
  useSellDraftStore.setState({ patchDetails: patchDetailsSpy });

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
  useSellDraftStore.setState({ patchDetails: ORIGINAL_PATCH_DETAILS });
});

describe("DetailsStep", () => {
  it("fetches category parents and leaves, then clears the visible leaf selection when the parent changes", async () => {
    renderStep();

    fireEvent.click(await screen.findByRole("button", { name: "Tops" }));
    expect(patchDetailsSpy).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "T-Shirts" }));
    expect(patchDetailsSpy).toHaveBeenLastCalledWith(
      { categoryId: TOPS_TSHIRTS.id },
      { immediate: true },
    );

    await useSellDraftStore.getState().flush();
    expect(screen.getByRole("button", { name: "T-Shirts" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Bottoms" }));
    await screen.findByRole("button", { name: "Jeans" });

    expect(screen.queryByRole("button", { name: "T-Shirts" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jeans" })).toHaveAttribute("aria-pressed", "false");
    expect(patchDetailsSpy).toHaveBeenCalledTimes(1);
  });

  it("changes size options by garment type and clears the selected size when switching scale", async () => {
    renderStep();

    fireEvent.click(await screen.findByRole("button", { name: "Dresses" }));
    await screen.findByRole("button", { name: "Midi Dresses" });

    expect(screen.getByRole("button", { name: "XS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use AU numbers (6, 8, 10...)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "M" }));
    expect(patchDetailsSpy).toHaveBeenLastCalledWith(
      { size: "M", sizeScale: "alpha" },
      { immediate: true },
    );

    await useSellDraftStore.getState().flush();

    fireEvent.click(screen.getByRole("button", { name: "Use AU numbers (6, 8, 10...)" }));
    expect(patchDetailsSpy).toHaveBeenLastCalledWith(
      { size: null, sizeScale: "au" },
      { immediate: true },
    );

    await useSellDraftStore.getState().flush();
    expect(screen.queryByRole("button", { name: "XS" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "6" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Footwear" }));
    await screen.findByRole("button", { name: "Sneakers" });

    expect(screen.getByRole("button", { name: "4" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use letters (S, M, L...)" })).not.toBeInTheDocument();
  });

  it("supports free-text brand entry and suggestion selection in the combobox", async () => {
    renderStep();

    const brandInput = screen.getByRole("combobox", { name: /brand/i });

    fireEvent.change(brandInput, { target: { value: "Custom Label" } });
    expect(patchDetailsSpy).toHaveBeenLastCalledWith(
      { brand: "Custom Label" },
      { immediate: true },
    );

    await useSellDraftStore.getState().flush();

    fireEvent.focus(brandInput);
    fireEvent.change(brandInput, { target: { value: "Nik" } });
    fireEvent.keyDown(brandInput, { key: "Enter" });

    await waitFor(() => {
      expect(brandInput).toHaveValue("Nike");
    });
    expect(patchDetailsSpy).toHaveBeenLastCalledWith(
      { brand: "Nike" },
      { immediate: true },
    );
  });

  it("lights the title coach chips when the title includes the brand, garment word, and a colour", async () => {
    currentDraft = buildDraft({ brand: "Nike" });
    const { container } = renderStep(currentDraft);

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Nike blue jacket" },
    });

    const coach = container.querySelector(".coach");
    expect(coach).not.toBeNull();

    const coachRegion = within(coach as HTMLElement);
    expect(coachRegion.getByText(/Brand$/)).toHaveClass("ok");
    expect(coachRegion.getByText(/Item type$/)).toHaveClass("ok");
    expect(coachRegion.getByText(/Colour$/)).toHaveClass("ok");
  });

  it("appends description quick-add copy and keeps the chip used after later edits", async () => {
    renderStep();

    const description = screen.getByLabelText(/^Description/);
    const chip = screen.getByRole("button", { name: /\+ Smoke-free home/i });

    fireEvent.click(chip);
    expect(description).toHaveValue("Smoke-free home.");
    expect(chip).toHaveClass("used");

    await useSellDraftStore.getState().flush();

    fireEvent.change(description, { target: { value: "" } });
    await useSellDraftStore.getState().flush();

    expect(chip).toHaveClass("used");
  });

  it("renders the size-chart link only for brands with a mapped guide slug", async () => {
    currentDraft = buildDraft({ brand: "HOKA" });
    renderStep(currentDraft);

    expect(screen.queryByRole("link", { name: /Check the .* size chart/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: /brand/i }), {
      target: { value: "Nike" },
    });

    const nikeLink = await screen.findByRole("link", { name: /Check the Nike size chart/i });
    expect(nikeLink).toHaveAttribute("href", "/guides/size-charts/nike/");

    fireEvent.change(screen.getByRole("combobox", { name: /brand/i }), {
      target: { value: "HOKA" },
    });

    expect(screen.queryByRole("link", { name: /Check the .* size chart/i })).not.toBeInTheDocument();
  });

  it("renders AI chips only while the canonical field still matches the AI suggestion", async () => {
    currentDraft = buildDraft({
      title: "Nike blue jacket",
      brand: "Nike",
      categoryId: TOPS_TSHIRTS.id,
      category: {
        id: TOPS_TSHIRTS.id,
        slug: TOPS_TSHIRTS.slug,
        name: TOPS_TSHIRTS.name,
        parentId: TOPS_PARENT.id,
        parentSlug: TOPS_PARENT.slug,
      },
      colour: "blue",
      description: "Smoke-free home.",
      aiTitle: "Nike blue jacket",
      aiSuggestedBrand: "Nike",
      aiSuggestedCategory: TOPS_TSHIRTS.slug,
      aiSuggestedColour: "blue",
      aiDescription: "Smoke-free home.",
    });

    const { container } = renderStep(currentDraft);
    await screen.findByRole("button", { name: "T-Shirts" });

    expect(container.querySelectorAll(".field.aifill .aichip")).toHaveLength(5);

    fireEvent.change(screen.getByRole("combobox", { name: /brand/i }), {
      target: { value: "Nike Lab" },
    });

    await waitFor(() => {
      expect(container.querySelectorAll(".field.aifill .aichip")).toHaveLength(4);
    });
  });
});
