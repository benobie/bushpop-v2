// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpResponse, http } from "msw";
import { server } from "@/test/msw/server";
import { resetSellDraftStoreForTests, useSellDraftStore } from "@/lib/sell/store";
import type { SellDraft } from "@/lib/sell/types";
import {
  BLUR_VARIANCE_THRESHOLD,
  compressImageForUpload,
  createPromiseQueue,
  assessPhotoQuality,
  PhotosStep,
} from "../photos-step";

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
const REORDER_URL = /\/api\/v1\/seller\/inventory\/[^/]+\/images\/order$/;

function buildImage(overrides: Partial<SellDraft["images"][number]> = {}): SellDraft["images"][number] {
  return {
    id: "01J0IMAGE000000000000000000",
    url: "https://images.example/original.jpg",
    thumbUrl: "https://images.example/thumb.webp",
    contentType: "image/webp",
    sizeBytes: 120_000,
    status: "ready",
    position: 0,
    isPrimary: false,
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

function createSolidFrame(width: number, height: number, value: number) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }

  return { width, height, data };
}

function createCheckerboardFrame(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = ((y * width) + x) * 4;
      const value = (x + y) % 2 === 0 ? 0 : 255;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}

beforeEach(() => {
  resetSellDraftStoreForTests();
});

describe("photos-step helpers", () => {
  it("falls back to jpeg when webp encoding silently fails", async () => {
    const input = new File([new Uint8Array([1, 2, 3])], "dress.png", { type: "image/png" });
    const compress = vi
      .fn()
      .mockResolvedValueOnce(new File([new Uint8Array([4, 5])], "dress.webp", { type: "image/png" }))
      .mockResolvedValueOnce(new File([new Uint8Array([6, 7])], "dress.jpg", { type: "image/jpeg" }));

    const result = await compressImageForUpload(input, {
      compress,
      supportsWebpEncoding: () => true,
    });

    expect(compress).toHaveBeenCalledTimes(2);
    expect(compress.mock.calls[0]?.[1]).toMatchObject({ fileType: "image/webp" });
    expect(compress.mock.calls[1]?.[1]).toMatchObject({ fileType: "image/jpeg" });
    expect(result.type).toBe("image/jpeg");
  });

  it("flags small, dark, blurry photos and clears sharp ones", () => {
    const darkBlurred = assessPhotoQuality(
      createSolidFrame(8, 8, 20),
      { width: 700, height: 1200 },
    );
    const brightSharp = assessPhotoQuality(
      createCheckerboardFrame(8, 8),
      { width: 1400, height: 1800 },
    );

    expect(darkBlurred.tooSmall).toBe(true);
    expect(darkBlurred.isDark).toBe(true);
    expect(darkBlurred.isBlurry).toBe(true);

    expect(brightSharp.tooSmall).toBe(false);
    expect(brightSharp.isDark).toBe(false);
    expect(brightSharp.isBlurry).toBe(false);
    expect(brightSharp.blurVariance).toBeGreaterThan(BLUR_VARIANCE_THRESHOLD);
  });

  it("limits queued work to the configured concurrency", async () => {
    const run = createPromiseQueue(2);
    const started: number[] = [];
    const resolvers = new Map<number, () => void>();
    let active = 0;
    let peak = 0;

    function queueTask(id: number) {
      return run(async () => {
        started.push(id);
        active += 1;
        peak = Math.max(peak, active);

        await new Promise<void>((resolve) => {
          resolvers.set(id, () => {
            active -= 1;
            resolve();
          });
        });
      });
    }

    const taskOne = queueTask(1);
    const taskTwo = queueTask(2);
    const taskThree = queueTask(3);
    const taskFour = queueTask(4);

    await waitFor(() => {
      expect(started).toEqual([1, 2]);
    });

    resolvers.get(1)?.();

    await waitFor(() => {
      expect(started).toEqual([1, 2, 3]);
    });

    resolvers.get(2)?.();

    await waitFor(() => {
      expect(started).toEqual([1, 2, 3, 4]);
    });

    resolvers.get(3)?.();
    resolvers.get(4)?.();

    await Promise.all([taskOne, taskTwo, taskThree, taskFour]);

    expect(peak).toBe(2);
  });
});

describe("PhotosStep", () => {
  it("sends the full reorder payload when a photo moves right", async () => {
    const draft = buildDraft({
      images: [
        buildImage({
          id: "01J0IMAGE000000000000000001",
          position: 0,
          isPrimary: true,
        }),
        buildImage({
          id: "01J0IMAGE000000000000000002",
          position: 1,
          url: "https://images.example/second.jpg",
          thumbUrl: "https://images.example/second-thumb.webp",
        }),
        buildImage({
          id: "01J0IMAGE000000000000000003",
          position: 2,
          url: "https://images.example/third.jpg",
          thumbUrl: "https://images.example/third-thumb.webp",
        }),
      ],
    });

    let reorderBody: unknown = null;

    server.use(
      http.patch(REORDER_URL, async ({ request }) => {
        reorderBody = await request.json();

        return HttpResponse.json([
          {
            id: "01J0IMAGE000000000000000002",
            url: "https://images.example/second.jpg",
            contentType: "image/webp",
            sizeBytes: 120_000,
            status: "ready",
            position: 0,
            isPrimary: false,
            confirmedAt: "2026-07-04T00:00:00.000Z",
            createdAt: "2026-07-04T00:00:00.000Z",
          },
          {
            id: "01J0IMAGE000000000000000001",
            url: "https://images.example/original.jpg",
            contentType: "image/webp",
            sizeBytes: 120_000,
            status: "ready",
            position: 1,
            isPrimary: true,
            confirmedAt: "2026-07-04T00:00:00.000Z",
            createdAt: "2026-07-04T00:00:00.000Z",
          },
          {
            id: "01J0IMAGE000000000000000003",
            url: "https://images.example/third.jpg",
            contentType: "image/webp",
            sizeBytes: 120_000,
            status: "ready",
            position: 2,
            isPrimary: false,
            confirmedAt: "2026-07-04T00:00:00.000Z",
            createdAt: "2026-07-04T00:00:00.000Z",
          },
        ]);
      }),
    );

    useSellDraftStore.setState({
      draft,
      aiMeta: { status: "idle" },
      wizardMeta: { startedAt: 0, resumed: false },
      status: "idle",
      lastError: null,
    });

    render(<PhotosStep />);

    fireEvent.click(screen.getByRole("button", { name: "Move photo 1 right" }));

    await waitFor(() => {
      expect(reorderBody).toEqual([
        {
          imageId: "01J0IMAGE000000000000000002",
          position: 0,
          isPrimary: false,
        },
        {
          imageId: "01J0IMAGE000000000000000001",
          position: 1,
          isPrimary: true,
        },
        {
          imageId: "01J0IMAGE000000000000000003",
          position: 2,
          isPrimary: false,
        },
      ]);
    });
  });
});
