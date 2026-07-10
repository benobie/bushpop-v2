// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetSellDraftStoreForTests,
  useSellDraftStore,
} from "@/lib/sell/store";
import type { SellDraft } from "@/lib/sell/types";
import { PriceStep } from "../price-step";

const ORIGINAL_PATCH_PRICE = useSellDraftStore.getState().patchPrice;

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

function renderPriceStep(overrides: Partial<SellDraft> = {}) {
  const patchPrice = vi.fn();

  useSellDraftStore.setState({
    draft: buildDraft(overrides),
    patchPrice,
  });

  render(<PriceStep />);

  return { patchPrice };
}

function totalRow(): HTMLElement {
  const row = screen.getByText("You receive").closest(".tot");
  if (!(row instanceof HTMLElement)) {
    throw new Error("Expected payout total row");
  }

  return row;
}

beforeEach(() => {
  resetSellDraftStoreForTests();
  useSellDraftStore.setState({ patchPrice: ORIGINAL_PATCH_PRICE });
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
});

describe("PriceStep", () => {
  it("shows the locked $185.25 payout for a $200 prepaid medium-label listing", () => {
    renderPriceStep({
      askingPriceCents: 20_000,
      shippingOption: "prepaid",
      parcelSize: "medium",
    });

    expect(screen.getByText("Shipping label")).toBeInTheDocument();
    expect(screen.getByText("-$3.80")).toBeInTheDocument();
    expect(screen.getByText("-$10.95")).toBeInTheDocument();
    expect(within(totalRow()).getByText("$185.25")).toBeInTheDocument();
  });

  it("renders the 10%-comparison line only when the delta is above zero", () => {
    const { patchPrice } = renderPriceStep({
      askingPriceCents: 300,
      shippingOption: "pickup",
    });

    const askingPriceInput = screen.getByLabelText(/Asking price/i);

    expect(screen.queryByText(/typical 10%-fee marketplace/i)).not.toBeInTheDocument();

    fireEvent.change(askingPriceInput, { target: { value: "4" } });

    expect(patchPrice).toHaveBeenLastCalledWith({ askingPriceCents: 400 });
    expect(screen.getByText(/typical 10%-fee marketplace/i)).toHaveTextContent("$0.03");

    fireEvent.change(askingPriceInput, { target: { value: "3" } });

    expect(patchPrice).toHaveBeenLastCalledWith({ askingPriceCents: 300 });
    expect(screen.queryByText(/typical 10%-fee marketplace/i)).not.toBeInTheDocument();
  });

  it("recalculates payout without a label deduction when shipping is not prepaid", () => {
    renderPriceStep({
      askingPriceCents: 20_000,
      shippingOption: "prepaid",
      parcelSize: "medium",
    });

    expect(within(totalRow()).getByText("$185.25")).toBeInTheDocument();
    expect(screen.getByText("Shipping label")).toBeInTheDocument();

    act(() => {
      useSellDraftStore.setState({
        draft: buildDraft({
          askingPriceCents: 20_000,
          shippingOption: "buyer_pays",
          parcelSize: "medium",
        }),
      });
    });

    expect(screen.queryByText("Shipping label")).not.toBeInTheDocument();
    expect(within(totalRow()).getByText("$196.20")).toBeInTheDocument();
  });
});
