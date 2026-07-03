// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpResponse, http } from "msw";
import { server } from "@/test/msw/server";
import {
  getSellDraftStorageKey,
} from "@/lib/sell/resume";
import {
  resetSellDraftStoreForTests,
  useSellDraftStore,
} from "@/lib/sell/store";
import type { SellDraft } from "@/lib/sell/types";
import { SellWizard, type DraftSummary } from "../sell-wizard";

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

  async function buildResult(response: Response) {
    const json = await parseJson(response);

    return response.ok
      ? { data: json, response }
      : { error: json, response };
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

          return buildResult(response);
        },
        async POST(pathname: string) {
          const response = await fetch(buildUrl(pathname), {
            method: "POST",
            credentials: "include",
            headers: {
              "x-requested-with": "XMLHttpRequest",
            },
          });

          return buildResult(response);
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

          return buildResult(response);
        },
      };
    },
  };
});

vi.mock("@/lib/analytics", () => ({
  track: trackMock,
}));

const API_ORIGIN = apiOrigin;
const DRAFTS_URL = `${API_ORIGIN}/api/v1/seller/drafts`;
const DRAFT_URL = /\/api\/v1\/seller\/drafts\/[^/]+$/;
const DETAILS_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/details$/;

const ORIGINAL_PATCH_DETAILS = useSellDraftStore.getState().patchDetails;

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

function buildSummary(overrides: Partial<DraftSummary> = {}): DraftSummary {
  return {
    id: "01J0SELLDRAFT00000000000000",
    version: 1,
    title: "Saved draft",
    updatedAt: "2026-07-04T00:00:00.000Z",
    readyImageCount: 0,
    strengthScore: 0,
    ...overrides,
  };
}

function activeStepLabel(container: HTMLElement): string | null {
  return container.querySelector(".step[aria-current='step'] .label")?.textContent ?? null;
}

async function resumeFromBanner() {
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  await screen.findByRole("button", { name: "Continue" });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/sell");
  localStorage.clear();
  resetSellDraftStoreForTests();
  useSellDraftStore.setState({ patchDetails: ORIGINAL_PATCH_DETAILS });
  trackMock.mockClear();
});

describe("SellWizard", () => {
  it("renders the draft banner and hides the stepper until the seller chooses", async () => {
    const oldDraftId = "01J0OLD0000000000000000000";

    server.use(
      http.post(DRAFTS_URL, () => HttpResponse.json(buildDraft({ id: "01J0NEW0000000000000000000" }))),
    );

    localStorage.setItem(
      getSellDraftStorageKey(oldDraftId),
      JSON.stringify({
        draft: buildDraft({ id: oldDraftId, title: "Old local draft" }),
        wizardMeta: { startedAt: 123, resumed: true },
      }),
    );

    render(
      <SellWizard
        existingDraft={buildSummary({
          id: oldDraftId,
          updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        })}
        initialDraftId={oldDraftId}
      />,
    );

    expect(screen.getByText(/You have a draft from/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));

    await screen.findByRole("button", { name: "Continue" });

    expect(screen.queryByText(/You have a draft from/i)).not.toBeInTheDocument();
    expect(localStorage.getItem(getSellDraftStorageKey(oldDraftId))).toBeNull();
    expect(window.location.search).toBe("?step=photos");
  });

  it("skips the draft banner when there is no existing draft", async () => {
    server.use(
      http.post(DRAFTS_URL, () => HttpResponse.json(buildDraft())),
    );

    render(<SellWizard existingDraft={null} initialDraftId={null} />);

    expect(screen.queryByText(/You have a draft from/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("tracks wizard.started when a fresh draft hydrates", async () => {
    server.use(
      http.post(DRAFTS_URL, () => HttpResponse.json(buildDraft())),
    );

    render(<SellWizard existingDraft={null} initialDraftId={null} />);

    await screen.findByRole("button", { name: "Continue" });

    expect(trackMock).toHaveBeenCalledWith({
      event: "wizard.started",
      props: {
        channel: "bushpop",
        resumed: false,
      },
    });
    expect(
      trackMock.mock.calls.filter(
        ([payload]) => payload.event === "wizard.started",
      ),
    ).toHaveLength(1);
  });

  it("tracks wizard.started when an existing draft is resumed", async () => {
    const resumeDraft = buildDraft();

    server.use(
      http.get(DRAFT_URL, () => HttpResponse.json(resumeDraft)),
    );

    render(
      <SellWizard
        existingDraft={buildSummary({ id: resumeDraft.id })}
        initialDraftId={resumeDraft.id}
      />,
    );

    await resumeFromBanner();

    expect(trackMock).toHaveBeenCalledWith({
      event: "wizard.started",
      props: {
        channel: "bushpop",
        resumed: true,
      },
    });
    expect(
      trackMock.mock.calls.filter(
        ([payload]) => payload.event === "wizard.started",
      ),
    ).toHaveLength(1);
  });

  it("resumes to the photos step even when a later missing item appears first", async () => {
    const resumeDraft = buildDraft({
      strength: {
        score: 15,
        band: "low",
        breakdown: {},
        missing: [
          { key: "price", label: "Set a price", step: 3, points: 10 },
          { key: "photos", label: "Add 1 more photo", step: 0, points: 5 },
        ],
        version: "v3",
      },
    });

    server.use(
      http.get(DRAFT_URL, () => HttpResponse.json(resumeDraft)),
    );

    const { container } = render(
      <SellWizard
        existingDraft={buildSummary({ id: resumeDraft.id })}
        initialDraftId={resumeDraft.id}
      />,
    );

    await resumeFromBanner();

    await waitFor(() => {
      expect(window.location.search).toBe("?step=photos");
    });
    expect(activeStepLabel(container)).toBe("Photos");
  });

  it("resumes to the price step when price is the first incomplete step", async () => {
    const resumeDraft = buildDraft({
      shippingOption: "buyer_pays",
      strength: {
        score: 65,
        band: "strong",
        breakdown: {},
        missing: [
          { key: "price", label: "Set a price", step: 3, points: 10 },
        ],
        version: "v3",
      },
    });

    server.use(
      http.get(DRAFT_URL, () => HttpResponse.json(resumeDraft)),
    );

    const { container } = render(
      <SellWizard
        existingDraft={buildSummary({ id: resumeDraft.id })}
        initialDraftId={resumeDraft.id}
      />,
    );

    await resumeFromBanner();

    await waitFor(() => {
      expect(window.location.search).toBe("?step=price");
    });
    expect(activeStepLabel(container)).toBe("Price");
  });

  it("resumes to shipping when strength is complete but shipping is still unset", async () => {
    const resumeDraft = buildDraft({
      strength: {
        score: 75,
        band: "strong",
        breakdown: {},
        missing: [],
        version: "v3",
      },
      shippingOption: null,
    });

    server.use(
      http.get(DRAFT_URL, () => HttpResponse.json(resumeDraft)),
    );

    const { container } = render(
      <SellWizard
        existingDraft={buildSummary({ id: resumeDraft.id })}
        initialDraftId={resumeDraft.id}
      />,
    );

    await resumeFromBanner();

    await waitFor(() => {
      expect(window.location.search).toBe("?step=shipping");
    });
    expect(activeStepLabel(container)).toBe("Shipping");
  });

  it("replays only differing local draft fields through the store patch method", async () => {
    const patchBodies: Array<Record<string, unknown>> = [];
    const resumeDraft = buildDraft({
      version: 7,
      title: "Server title",
      brand: "Shared brand",
      strength: {
        score: 35,
        band: "low",
        breakdown: {},
        missing: [
          { key: "description", label: "Describe it", step: 1, points: 10 },
        ],
        version: "v3",
      },
    });
    const patchDetailsSpy = vi.fn(
      (
        patch: Parameters<typeof ORIGINAL_PATCH_DETAILS>[0],
        opts?: Parameters<typeof ORIGINAL_PATCH_DETAILS>[1],
      ) => ORIGINAL_PATCH_DETAILS(patch, opts),
    );

    useSellDraftStore.setState({ patchDetails: patchDetailsSpy });

    localStorage.setItem(
      getSellDraftStorageKey(resumeDraft.id),
      JSON.stringify({
        draft: buildDraft({
          id: resumeDraft.id,
          version: 6,
          title: "Local title",
          brand: "Shared brand",
        }),
        wizardMeta: { startedAt: 1, resumed: true },
      }),
    );

    server.use(
      http.get(DRAFT_URL, () => HttpResponse.json(resumeDraft)),
      http.patch(DETAILS_URL, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        patchBodies.push(body);

        return HttpResponse.json(buildDraft({
          id: resumeDraft.id,
          version: 8,
          title: body.title as string,
          brand: resumeDraft.brand,
          strength: resumeDraft.strength,
        }));
      }),
    );

    render(
      <SellWizard
        existingDraft={buildSummary({ id: resumeDraft.id })}
        initialDraftId={resumeDraft.id}
      />,
    );

    await resumeFromBanner();

    await waitFor(() => {
      expect(patchDetailsSpy).toHaveBeenCalledTimes(1);
    });
    expect(patchDetailsSpy).toHaveBeenCalledWith(
      { title: "Local title" },
      { immediate: true },
    );
    expect(patchBodies).toEqual([
      { version: 7, title: "Local title" },
    ]);
  });

  it("tracks wizard.step_completed when continuing forward", async () => {
    let now = new Date("2026-07-04T00:10:00.000Z").getTime();
    const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    server.use(
      http.post(DRAFTS_URL, () => HttpResponse.json(buildDraft())),
    );

    render(<SellWizard existingDraft={null} initialDraftId={null} />);

    await screen.findByRole("button", { name: "Continue" });
    trackMock.mockClear();

    now += 2_500;
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith({
        event: "wizard.step_completed",
        props: {
          channel: "bushpop",
          step: 0,
          ms: 2_500,
        },
      });
    });

    dateNowSpy.mockRestore();
  });

  it("does not track wizard.step_completed on back or stepper jumps", async () => {
    server.use(
      http.post(DRAFTS_URL, () => HttpResponse.json(buildDraft())),
    );

    const { container } = render(<SellWizard existingDraft={null} initialDraftId={null} />);

    await screen.findByRole("button", { name: "Continue" });
    trackMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /Condition/ }));

    await waitFor(() => {
      expect(activeStepLabel(container)).toBe("Condition");
    });
    expect(
      trackMock.mock.calls.filter(
        ([payload]) => payload.event === "wizard.step_completed",
      ),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() => {
      expect(activeStepLabel(container)).toBe("Details");
    });
    expect(
      trackMock.mock.calls.filter(
        ([payload]) => payload.event === "wizard.step_completed",
      ),
    ).toHaveLength(0);
  });
});
