// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ListingStrengthInput } from "@bushpop/config";
import { computeListingStrength } from "@bushpop/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetSellDraftStoreForTests,
  useSellDraftStore,
} from "@/lib/sell/store";
import {
  READY_PULSE_DURATION_MS,
  shouldEnterAdvance,
  useReadyPulse,
} from "@/lib/sell/use-ready-pulse";
import type { SellDraft } from "@/lib/sell/types";
import { WizardAside } from "../wizard-aside";

const EMPTY_INPUT: ListingStrengthInput = {
  photoCount: 0,
  title: null,
  brand: null,
  categoryLeaf: null,
  size: null,
  sizeExempt: false,
  colour: null,
  description: null,
  condition: null,
  hasMeasurements: false,
  priceCents: null,
  rrpCents: null,
  offersEnabled: false,
};

function buildImage(
  index: number,
  overrides: Partial<SellDraft["images"][number]> = {},
): SellDraft["images"][number] {
  return {
    id: `01J0IMAGE0000000000000000${index}`,
    url: `https://images.example/original-${index}.jpg`,
    thumbUrl: `https://images.example/thumb-${index}.webp`,
    contentType: "image/webp",
    sizeBytes: 120_000,
    status: "ready",
    position: index,
    isPrimary: index === 0,
    confirmedAt: "2026-07-04T00:00:00.000Z",
    createdAt: "2026-07-04T00:00:00.000Z",
    ...overrides,
  };
}

function buildDraftFromStrengthInput(
  overrides: Partial<ListingStrengthInput> = {},
  draftOverrides: Partial<SellDraft> = {},
): SellDraft {
  const input = { ...EMPTY_INPUT, ...overrides };
  const categorySlug = input.categoryLeaf?.trim() ? input.categoryLeaf.trim() : null;
  const strength = computeListingStrength(input);

  return {
    id: "01J0SELLDRAFT00000000000000",
    version: 1,
    lifecycleState: "owned",
    title: input.title ?? null,
    brand: input.brand ?? null,
    categoryId: categorySlug ? "01J0CATEGORY000000000000000" : null,
    category: categorySlug
      ? {
          id: "01J0CATEGORY000000000000000",
          slug: categorySlug,
          name: "Category",
          parentId: "01J0PARENT0000000000000000",
          parentSlug: "tops",
        }
      : null,
    size: input.size ?? null,
    sizeScale: input.sizeExempt ? null : "alpha",
    colour: input.colour ?? null,
    description: input.description ?? null,
    condition: input.condition ?? null,
    conditionNotes: null,
    measurements: input.hasMeasurements ? { chest: 55 } : null,
    measurementTemplate: {
      key: "tops",
      keys: ["chest", "length"],
      sizeExempt: input.sizeExempt ?? false,
    },
    askingPriceCents: input.priceCents ?? null,
    rrpCents: input.rrpCents ?? null,
    shippingOption: null,
    parcelSize: null,
    shippingClass: null,
    images: Array.from({ length: input.photoCount }, (_value, index) => buildImage(index)),
    strength: {
      score: strength.score,
      band: "low",
      breakdown: strength.breakdown,
      missing: strength.missing,
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
    ...draftOverrides,
  };
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function renderWizardAside(
  inputOverrides: Partial<ListingStrengthInput> = {},
  draftOverrides: Partial<SellDraft> = {},
  onJumpToStep?: (step: string) => void,
) {
  useSellDraftStore.setState({
    draft: buildDraftFromStrengthInput(inputOverrides, draftOverrides),
  });

  return render(<WizardAside onJumpToStep={onJumpToStep} />);
}

function ReadyPulseProbe({ isReady }: { isReady: boolean }) {
  const pulsing = useReadyPulse(isReady);
  return <div data-testid="pulse">{pulsing ? "on" : "off"}</div>;
}

beforeEach(() => {
  resetSellDraftStoreForTests();
  stubMatchMedia(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WizardAside", () => {
  it("renders the empty-state score and band", () => {
    const { container } = renderWizardAside();

    expect(container.querySelector(".snum")).toHaveTextContent("0");
    expect(container.querySelector(".sband")).toHaveTextContent("Just started");
    expect(screen.getByText("40 pts to Good start")).toBeInTheDocument();
    expect(container.querySelector(".strengthmini")).toHaveTextContent("Listing strength0");
  });

  it("recomputes the live score from draft fields instead of trusting a stale server score", () => {
    const staleStrength = {
      score: 12,
      band: "low",
      breakdown: {},
      missing: [],
      version: "v3",
    } as SellDraft["strength"];
    const { container } = renderWizardAside(
      {
        photoCount: 1,
        title: "adidas Gazelle sneakers - navy suede",
        brand: "adidas",
        categoryLeaf: "sneakers",
        size: "US 9",
        colour: "Blue",
        description: "Retro Gazelles, lightly worn.",
        condition: "Very good",
        hasMeasurements: true,
        priceCents: 12_000,
      },
      { strength: staleStrength },
    );

    expect(container.querySelector(".snum")).toHaveTextContent("75");
    expect(container.querySelector(".sband")).toHaveTextContent("Strong");
    expect(container.querySelector(".sspeed")).toHaveTextContent(
      "Nearly there. A couple of boosts to go.",
    );
  });

  it("renders the excellent band copy for a fully-synced strong draft", () => {
    const { container } = renderWizardAside({
      photoCount: 4,
      title: "The North Face Nuptse puffer jacket - black",
      brand: "The North Face",
      categoryLeaf: "outerwear",
      size: "M",
      colour: "Black",
      description:
        "Iconic North Face Nuptse puffer in black. Warm, boxy and easy to wear, with laid-flat measurements included.",
      condition: "Excellent",
      hasMeasurements: true,
      priceCents: 20_000,
      rrpCents: 35_000,
    });

    expect(container.querySelector(".snum")).toHaveTextContent("100");
    expect(container.querySelector(".sband")).toHaveTextContent("Excellent");
    expect(container.querySelector(".sspeed")).toHaveTextContent(
      "Listings like this sell up to 3x faster",
    );
  });

  it("shows the top three highest-point missing items in order and jumps to their steps", () => {
    const onJumpToStep = vi.fn();
    const { container } = renderWizardAside(
      {
        photoCount: 1,
        title: "Vintage Adidas windbreaker jacket",
        brand: "adidas",
        categoryLeaf: "jackets",
        size: "M",
        colour: "Blue",
        description: "Too short",
        condition: "Very good",
        hasMeasurements: true,
        priceCents: 15_000,
      },
      {},
      onJumpToStep,
    );

    const rows = Array.from(container.querySelectorAll(".snext .nx"));

    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Add 3 more photos");
    expect(rows[0]).toHaveTextContent("+15 pts");
    expect(rows[1]).toHaveTextContent("Describe it (40+ characters)");
    expect(rows[1]).toHaveTextContent("+10 pts");
    expect(rows[2]).toHaveTextContent("Add the RRP");
    expect(rows[2]).toHaveTextContent("+3 pts");

    fireEvent.click(rows[0]);
    expect(onJumpToStep).toHaveBeenCalledWith("photos");

    fireEvent.keyDown(rows[1], { key: "Enter" });
    expect(onJumpToStep).toHaveBeenLastCalledWith("details");

    fireEvent.keyDown(rows[2], { key: " " });
    expect(onJumpToStep).toHaveBeenLastCalledWith("price");
  });

  it("shows and hides the near-miss nudge at the right band thresholds", () => {
    const { rerender } = render(<WizardAside />);

    act(() => {
      useSellDraftStore.setState({
        draft: buildDraftFromStrengthInput({
          photoCount: 4,
          title: "Aritzia linen shirt dress",
          categoryLeaf: "dresses",
          size: "S",
          colour: "White",
          description:
            "Lightweight linen dress with a clean silhouette and a matching waist tie for easy summer wear.",
          rrpCents: 12_000,
        }),
      });
    });

    expect(screen.getByText("2 pts to Strong")).toBeInTheDocument();

    act(() => {
      useSellDraftStore.setState({
        draft: buildDraftFromStrengthInput({
          photoCount: 1,
          title: "Gorman printed midi dress",
          brand: "Gorman",
          categoryLeaf: "dresses",
          size: "10",
          colour: "Multi",
          description:
            "Bold printed midi dress with a relaxed fit, side pockets and laid-flat measurements ready to go.",
          condition: "Excellent",
          hasMeasurements: true,
          priceCents: 14_000,
          rrpCents: 24_000,
        }),
      });
    });

    expect(screen.getByText("2 pts to Excellent")).toBeInTheDocument();

    act(() => {
      useSellDraftStore.setState({
        draft: buildDraftFromStrengthInput({
          photoCount: 4,
          title: "Assembly Label cotton poplin shirt",
          categoryLeaf: "shirts",
          size: "M",
          description:
            "Crisp cotton poplin shirt in excellent shape, with clean lines, classic cuffs and laid-flat measurements included.",
          condition: "Excellent",
          hasMeasurements: true,
          priceCents: 11_000,
        }),
      });
    });

    rerender(<WizardAside />);

    expect(screen.queryByText(/pts to /i)).not.toBeInTheDocument();
  });
});

describe("useReadyPulse", () => {
  it("pulses for the configured window after readiness flips from false to true", () => {
    vi.useFakeTimers();

    const { rerender } = render(<ReadyPulseProbe isReady={false} />);

    expect(screen.getByTestId("pulse")).toHaveTextContent("off");

    act(() => {
      rerender(<ReadyPulseProbe isReady />);
    });

    expect(screen.getByTestId("pulse")).toHaveTextContent("on");

    act(() => {
      vi.advanceTimersByTime(READY_PULSE_DURATION_MS - 1);
    });

    expect(screen.getByTestId("pulse")).toHaveTextContent("on");

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByTestId("pulse")).toHaveTextContent("off");
  });

  it("skips the timed pulse when reduced motion is enabled", () => {
    vi.useFakeTimers();
    stubMatchMedia(true);

    const { rerender } = render(<ReadyPulseProbe isReady={false} />);

    act(() => {
      rerender(<ReadyPulseProbe isReady />);
    });

    expect(screen.getByTestId("pulse")).toHaveTextContent("off");
  });
});

describe("shouldEnterAdvance", () => {
  it("returns false for textareas and for the review step", () => {
    expect(shouldEnterAdvance(document.createElement("textarea"), "details")).toBe(false);
    expect(shouldEnterAdvance(document.createElement("input"), "review")).toBe(false);
  });

  it("returns true for other focused elements on non-review steps", () => {
    expect(shouldEnterAdvance(document.createElement("input"), "details")).toBe(true);
    expect(shouldEnterAdvance(null, "photos")).toBe(true);
  });
});
