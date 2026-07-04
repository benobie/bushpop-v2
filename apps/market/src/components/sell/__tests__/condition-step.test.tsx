// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetSellDraftStoreForTests,
  useSellDraftStore,
} from "@/lib/sell/store";
import type { SellDraft } from "@/lib/sell/types";
import { ConditionStep } from "../condition-step";

const ORIGINAL_PATCH_CONDITION = useSellDraftStore.getState().patchCondition;

function buildDraft(overrides: Partial<SellDraft> = {}): SellDraft {
  return {
    id: "01J0SELLDRAFT00000000000000",
    version: 1,
    lifecycleState: "owned",
    title: null,
    brand: null,
    categoryId: "01J0CATEGORY000000000000000",
    category: {
      id: "01J0CATEGORY000000000000000",
      slug: "tops",
      name: "Tops",
      parentId: "01J0PARENT0000000000000000",
      parentSlug: "tops",
    },
    size: null,
    sizeScale: null,
    colour: null,
    description: null,
    condition: null,
    conditionNotes: null,
    measurements: null,
    measurementTemplate: {
      key: "top",
      keys: ["chest", "shoulder", "length", "sleeve"],
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

function seedStore(draft: SellDraft, patchCondition = vi.fn()) {
  useSellDraftStore.setState({
    draft,
    patchCondition: patchCondition as typeof ORIGINAL_PATCH_CONDITION,
  });

  return patchCondition;
}

beforeEach(() => {
  resetSellDraftStoreForTests();
  useSellDraftStore.setState({
    patchCondition: ORIGINAL_PATCH_CONDITION,
  });
});

describe("ConditionStep", () => {
  it.each([
    {
      slug: "mini-dresses",
      parentSlug: "dresses",
      expectedInput: "Waist (flat)",
      expectedDiagram: "How to measure a dress laid flat",
      optionalCopy: null,
    },
    {
      slug: "sneakers",
      parentSlug: "footwear",
      expectedInput: "Insole length",
      expectedDiagram: "How to measure an insole",
      optionalCopy: null,
    },
    {
      slug: "tote-bags",
      parentSlug: "bags",
      expectedInput: "Strap drop",
      expectedDiagram: "How to measure a bag",
      optionalCopy: "Optional for bags and accessories",
    },
  ])(
    "resolves the correct template and diagram for $slug under $parentSlug",
    ({ slug, parentSlug, expectedInput, expectedDiagram, optionalCopy }) => {
      seedStore(
        buildDraft({
          category: {
            id: "01J0CATEGORY000000000000000",
            slug,
            name: slug,
            parentId: "01J0PARENT0000000000000000",
            parentSlug,
          },
        }),
      );

      render(<ConditionStep />);

      expect(screen.getByLabelText(expectedInput)).toBeInTheDocument();
      expect(
        screen.getByRole("img", { name: new RegExp(expectedDiagram, "i") }),
      ).toBeInTheDocument();

      if (optionalCopy) {
        expect(screen.getByText(optionalCopy)).toBeInTheDocument();
      }
    },
  );

  it("sends measurements as a whole-object replacement", () => {
    const patchCondition = seedStore(
      buildDraft({
        measurements: {
          chest: 50,
          shoulder: 41,
        },
      }),
    );

    render(<ConditionStep />);

    fireEvent.change(screen.getByLabelText("Length"), {
      target: { value: "62.5" },
    });

    expect(patchCondition).toHaveBeenCalledWith(
      {
        measurements: {
          chest: 50,
          shoulder: 41,
          length: 62.5,
        },
      },
      { immediate: true },
    );
    expect(
      screen.getByText("Nice, measurements cut returns and build buyer trust."),
    ).toBeInTheDocument();
  });

  it("fires condition selection immediately", () => {
    const patchCondition = seedStore(buildDraft());

    render(<ConditionStep />);

    fireEvent.click(screen.getByText("Good"));

    expect(patchCondition).toHaveBeenCalledWith(
      { condition: "good" },
      { immediate: true },
    );
  });

  it("queues condition notes without immediate mode", () => {
    const patchCondition = seedStore(buildDraft());

    render(<ConditionStep />);

    fireEvent.change(screen.getByLabelText("Condition notes Optional"), {
      target: { value: "Tiny mark on the cuff." },
    });

    expect(patchCondition).toHaveBeenCalledWith({
      conditionNotes: "Tiny mark on the cuff.",
    });
  });
});
