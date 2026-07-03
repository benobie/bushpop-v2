// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpResponse, http } from "msw";
import { server } from "@/test/msw/server";
import {
  startAiReveal,
  type AiRevealError,
  type AiRevealField,
  type AiRevealStatus,
} from "../ai-reveal";

const AI_DRAFT_REQUEST_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/ai-draft$/;
const AI_DRAFT_STATUS_URL = /\/api\/v1\/seller\/drafts\/[^/]+\/ai-draft\/[^/]+$/;

function flushAsync(): Promise<void> {
  return Promise.resolve().then(() => undefined).then(() => undefined).then(() => undefined);
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

function buildCompletedStatus() {
  return {
    jobId: "01J0AIDRAFTJOB0000000000000",
    status: "completed" as const,
    trigger: "auto",
    suggestions: {
      title: "Nike blue jacket",
      brand: "Nike",
      categoryLeaf: "t-shirts",
      colour: "blue",
      description: "Smoke-free home.",
      confidence: 0.82,
    },
    confidence: 0.82,
    createdAt: "2026-07-04T00:00:00.000Z",
    completedAt: "2026-07-04T00:00:02.000Z",
  };
}

function buildPendingStatus() {
  return {
    jobId: "01J0AIDRAFTJOB0000000000000",
    status: "pending" as const,
    trigger: "auto",
    suggestions: null,
    confidence: null,
    createdAt: "2026-07-04T00:00:00.000Z",
    completedAt: null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState({}, "", "/sell?step=details");
  setReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("startAiReveal", () => {
  it("stops polling when aborted", async () => {
    const statuses: AiRevealStatus[] = [];
    const errors: AiRevealError[] = [];
    const pollRequests: number[] = [];
    const controller = new AbortController();

    server.use(
      http.post(AI_DRAFT_REQUEST_URL, () =>
        HttpResponse.json(
          {
            jobId: "01J0AIDRAFTJOB0000000000000",
            status: "pending",
          },
          { status: 202 },
        )),
      http.get(AI_DRAFT_STATUS_URL, () => {
        pollRequests.push(Date.now());
        return HttpResponse.json(buildPendingStatus());
      }),
    );

    startAiReveal({
      draftId: "01J0SELLDRAFT00000000000000",
      trigger: "auto",
      signal: controller.signal,
      shouldRevealField: () => true,
      onFieldReveal: () => undefined,
      onStatusChange(status) {
        statuses.push(status);
      },
      onError(error) {
        errors.push(error);
      },
    });

    await flushAsync();
    const pollsBeforeAbort = pollRequests.length;

    controller.abort();
    await flushAsync();
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.waitFor(() => {
      expect(statuses.at(-1)).toBe("cancelled");
    });

    expect(pollRequests).toHaveLength(pollsBeforeAbort);
    expect(errors).toEqual([]);
  });

  it("fails after roughly 20 seconds of polling", async () => {
    const statuses: AiRevealStatus[] = [];
    const errors: AiRevealError[] = [];

    server.use(
      http.post(AI_DRAFT_REQUEST_URL, () =>
        HttpResponse.json(
          {
            jobId: "01J0AIDRAFTJOB0000000000000",
            status: "pending",
          },
          { status: 202 },
        )),
      http.get(AI_DRAFT_STATUS_URL, () => HttpResponse.json(buildPendingStatus())),
    );

    startAiReveal({
      draftId: "01J0SELLDRAFT00000000000000",
      trigger: "auto",
      signal: new AbortController().signal,
      shouldRevealField: () => true,
      onFieldReveal: () => undefined,
      onStatusChange(status) {
        statuses.push(status);
      },
      onError(error) {
        errors.push(error);
      },
    });

    await flushAsync();
    await vi.advanceTimersByTimeAsync(20_000);
    await flushAsync();
    await vi.waitFor(() => {
      expect(statuses.at(-1)).toBe("failed");
    });

    expect(errors).toContainEqual({ reason: "timeout" });
  });

  it("only reveals fields that are still empty when suggestions land", async () => {
    const statuses: AiRevealStatus[] = [];
    const revealed: AiRevealField[] = [];
    const titleTyping: string[] = [];
    let pollCount = 0;

    const canonicalValues: Record<AiRevealField, string | null> = {
      title: null,
      brand: null,
      category: null,
      colour: null,
      description: null,
    };

    server.use(
      http.post(AI_DRAFT_REQUEST_URL, () =>
        HttpResponse.json(
          {
            jobId: "01J0AIDRAFTJOB0000000000000",
            status: "pending",
          },
          { status: 202 },
        )),
      http.get(AI_DRAFT_STATUS_URL, () => {
        pollCount += 1;
        return HttpResponse.json(pollCount === 1 ? buildPendingStatus() : buildCompletedStatus());
      }),
    );

    startAiReveal({
      draftId: "01J0SELLDRAFT00000000000000",
      trigger: "auto",
      signal: new AbortController().signal,
      shouldRevealField(field) {
        return canonicalValues[field] === null;
      },
      onFieldReveal(field, value) {
        revealed.push(field);
        canonicalValues[field] = value;
      },
      onTitleTyping(partial) {
        titleTyping.push(partial);
      },
      onStatusChange(status) {
        statuses.push(status);
      },
    });

    await flushAsync();
    canonicalValues.brand = "Manual Brand";
    await vi.advanceTimersByTimeAsync(1_500);
    await vi.advanceTimersByTimeAsync(3_000);
    await flushAsync();
    await vi.waitFor(() => {
      expect(statuses.at(-1)).toBe("done");
    });

    expect(revealed).toEqual(["title", "category", "colour", "description"]);
    expect(titleTyping.length).toBeGreaterThan(0);
  });

  it("reports regenerate 429s as failed without throwing", async () => {
    const statuses: AiRevealStatus[] = [];
    const errors: AiRevealError[] = [];

    server.use(
      http.post(AI_DRAFT_REQUEST_URL, () =>
        HttpResponse.json(
          { message: "Too many regenerate attempts." },
          { status: 429 },
        )),
    );

    expect(() => {
      startAiReveal({
        draftId: "01J0SELLDRAFT00000000000000",
        trigger: "regenerate",
        signal: new AbortController().signal,
        shouldRevealField: () => true,
        onFieldReveal: () => undefined,
        onStatusChange(status) {
          statuses.push(status);
        },
        onError(error) {
          errors.push(error);
        },
      });
    }).not.toThrow();

    await flushAsync();
    await vi.waitFor(() => {
      expect(statuses.at(-1)).toBe("failed");
    });

    expect(errors).toContainEqual({
      reason: "request_failed",
      statusCode: 429,
    });
  });

  it("skips the typewriter and stagger when reduced motion is enabled", async () => {
    const statuses: AiRevealStatus[] = [];
    const revealed: Array<{ field: AiRevealField; value: string }> = [];
    const titleTyping: string[] = [];

    setReducedMotion(true);

    server.use(
      http.post(AI_DRAFT_REQUEST_URL, () =>
        HttpResponse.json(
          {
            jobId: "01J0AIDRAFTJOB0000000000000",
            status: "pending",
          },
          { status: 202 },
        )),
      http.get(AI_DRAFT_STATUS_URL, () => HttpResponse.json(buildCompletedStatus())),
    );

    startAiReveal({
      draftId: "01J0SELLDRAFT00000000000000",
      trigger: "auto",
      signal: new AbortController().signal,
      shouldRevealField: () => true,
      onFieldReveal(field, value) {
        revealed.push({ field, value });
      },
      onTitleTyping(partial) {
        titleTyping.push(partial);
      },
      onStatusChange(status) {
        statuses.push(status);
      },
    });

    await flushAsync();
    await vi.waitFor(() => {
      expect(revealed.map((entry) => entry.field)).toEqual([
        "title",
        "brand",
        "category",
        "colour",
        "description",
      ]);
    });

    expect(titleTyping).toEqual([]);
    expect(statuses.at(-1)).toBe("done");
    expect(vi.getTimerCount()).toBe(0);
  });
});
