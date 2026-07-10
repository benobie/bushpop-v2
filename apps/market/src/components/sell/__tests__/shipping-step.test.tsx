// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetSellDraftStoreForTests,
  useSellDraftStore,
} from "@/lib/sell/store";
import type { SellDraft } from "@/lib/sell/types";
import { ShippingStep } from "../shipping-step";

type PatchShippingArgs = {
  shippingOption?: SellDraft["shippingOption"];
  parcelSize?: SellDraft["parcelSize"];
};

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

function renderStep(overrides: Partial<SellDraft> = {}) {
  const patchShipping = vi.fn((patch: PatchShippingArgs) => {
    useSellDraftStore.setState((state) => {
      if (!state.draft) {
        return state;
      }

      return {
        draft: {
          ...state.draft,
          ...patch,
        },
      };
    });
  });

  useSellDraftStore.setState({
    draft: buildDraft(overrides),
    patchShipping,
  });

  return {
    patchShipping,
    ...render(<ShippingStep />),
  };
}

beforeEach(() => {
  resetSellDraftStoreForTests();
});

describe("ShippingStep", () => {
  it("renders all shipping options with the config labels", () => {
    renderStep();

    expect(
      screen.getByRole("button", { name: /Bushpop prepaid label/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Buyer pays postage/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Free shipping \(you cover it\)/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Local pickup/i })).toBeInTheDocument();
  });

  it("hides the parcel picker for pickup and shows it again for postal options", () => {
    const { patchShipping } = renderStep();

    expect(
      screen.getByRole("button", { name: /Small \(<500g\) - \$8\.55/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Local pickup/i }));

    expect(patchShipping).toHaveBeenCalledWith(
      { shippingOption: "pickup", parcelSize: null },
      { immediate: true },
    );
    expect(
      screen.queryByRole("button", { name: /Small \(<500g\) - \$8\.55/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Buyer pays postage/i }));

    expect(patchShipping).toHaveBeenLastCalledWith(
      { shippingOption: "buyer_pays" },
      { immediate: true },
    );
    expect(
      screen.getByRole("button", { name: /Small \(<500g\) - \$8\.55/i }),
    ).toBeInTheDocument();
  });

  it("patches shipping selections immediately", () => {
    const { patchShipping } = renderStep({
      shippingOption: "free",
    });

    fireEvent.click(screen.getByRole("button", { name: /Buyer pays postage/i }));
    fireEvent.click(screen.getByRole("button", { name: /Medium \(500g.+2kg\) - \$10\.95/i }));

    expect(patchShipping).toHaveBeenNthCalledWith(
      1,
      { shippingOption: "buyer_pays" },
      { immediate: true },
    );
    expect(patchShipping).toHaveBeenNthCalledWith(
      2,
      { shippingOption: "buyer_pays", parcelSize: "medium" },
      { immediate: true },
    );
  });

  it("uses prepaid as the local default only when the draft has no saved shipping option", () => {
    const { unmount } = renderStep();

    expect(screen.getByRole("button", { name: /Bushpop prepaid label/i })).toHaveClass("on");
    expect(screen.getByRole("button", { name: /Local pickup/i })).not.toHaveClass("on");

    unmount();
    resetSellDraftStoreForTests();
    renderStep({
      shippingOption: "pickup",
    });

    expect(screen.getByRole("button", { name: /Local pickup/i })).toHaveClass("on");
    expect(
      screen.getByRole("button", { name: /Bushpop prepaid label/i }),
    ).not.toHaveClass("on");
  });
});
