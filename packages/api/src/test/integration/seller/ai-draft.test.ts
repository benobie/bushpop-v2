import { describe, it, expect, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@bushpop/db/client";
import { aiGenerations, inventoryItems, inventoryItemImages } from "@bushpop/db/schema";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { authedRequest } from "../../helpers/http.js";

vi.mock("../../../lib/r2.js", async () => {
  const { mockR2 } = await import("../../helpers/r2-mock.js");
  return {
    ...mockR2(),
    createPresignedGetUrl: vi.fn(async (key: string) => `https://r2.example.com/get/${key}`),
  };
});

// Controllable fake providers — NO live key ever runs in tests.
const primaryGenerate = vi.fn();
const escalationGenerate = vi.fn();
let primaryEnabled = true;
let escalationEnabled = true;

vi.mock("../../../lib/ai/provider.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../lib/ai/provider.js")>();
  return {
    ...original,
    isAiDraftEnabled: () => primaryEnabled || escalationEnabled,
    getPrimaryProvider: async () =>
      primaryEnabled
        ? { name: "gemini", model: "gemini-2.5-flash-lite", generateDraft: primaryGenerate }
        : null,
    getEscalationProvider: async () =>
      escalationEnabled
        ? { name: "anthropic", model: "claude-haiku-4-5", generateDraft: escalationGenerate }
        : null,
  };
});

import { processAiDraftJob } from "../../../workers/ai-draft.js";

const GOOD_RAW = {
  title: "adidas Gazelle sneakers — navy suede",
  brand: "adidas",
  category_leaf: "sneakers",
  colour: "navy",
  gender: "unisex",
  description: "Retro Gazelles in navy suede on the gum sole. Lightly worn, clean uppers.",
  confidence: 0.9,
};

function providerResult(raw: typeof GOOD_RAW) {
  return { raw, inputTokens: 1000, outputTokens: 150, costUsdMicros: 160 };
}

describe("AI draft endpoints + worker", () => {
  let sessionToken: string;
  let userId: string;

  beforeEach(async () => {
    const { user, sessionToken: token } = await signUpTestUser();
    userId = user.id;
    sessionToken = token;
    await grantSellerRole(userId);
    primaryGenerate.mockReset();
    escalationGenerate.mockReset();
    primaryEnabled = true;
    escalationEnabled = true;
  });

  async function createDraftWithPhoto(): Promise<string> {
    const res = await authedRequest(sessionToken, "POST", "/api/v1/seller/drafts", {});
    const draft = res.json();
    const imageId = ulid();
    await db.insert(inventoryItemImages).values({
      id: imageId,
      inventoryItemId: draft.id,
      storageKey: `items/${draft.id}/${imageId}.jpg`,
      status: "ready",
      isPrimary: true,
    });
    return draft.id;
  }

  async function requestDraft(itemId: string, trigger = "auto") {
    return authedRequest(sessionToken, "POST", `/api/v1/seller/drafts/${itemId}/ai-draft`, {
      trigger,
    });
  }

  it("202s with a jobId and creates a pending generation row", async () => {
    const itemId = await createDraftWithPhoto();
    const res = await requestDraft(itemId);
    expect(res.statusCode).toBe(202);
    const { jobId, status } = res.json();
    expect(status).toBe("pending");

    const [row] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, jobId));
    expect(row!.status).toBe("pending");
    expect(row!.trigger).toBe("auto");
    expect(row!.promptVersion).toBe("v2");
  });

  it("rejects drafts without a ready photo", async () => {
    const res = await authedRequest(sessionToken, "POST", "/api/v1/seller/drafts", {});
    const draft = res.json();
    const aiRes = await requestDraft(draft.id);
    expect(aiRes.statusCode).toBe(422);
  });

  it("worker completes the generation and mirrors ONLY ai* columns", async () => {
    const itemId = await createDraftWithPhoto();
    primaryGenerate.mockResolvedValue(providerResult(GOOD_RAW));

    const { jobId } = (await requestDraft(itemId)).json();
    await processAiDraftJob({ generationId: jobId, inventoryItemId: itemId, sellerId: userId });

    const poll = await authedRequest(
      sessionToken,
      "GET",
      `/api/v1/seller/drafts/${itemId}/ai-draft/${jobId}`,
    );
    expect(poll.statusCode).toBe(200);
    const body = poll.json();
    expect(body.status).toBe("completed");
    expect(body.suggestions.brand).toBe("adidas");
    expect(body.suggestions.categoryLeaf).toBe("sneakers");
    expect(body.confidence).toBe(0.9);

    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
    expect(item!.aiTitle).toBe(GOOD_RAW.title);
    expect(item!.aiSuggestedBrand).toBe("adidas");
    expect(item!.aiSuggestedCategory).toBe("sneakers");
    expect(item!.aiSuggestedGender).toBe("unisex");
    // Canonical fields NEVER touched (confirm-not-commit)
    expect(item!.title).toBeNull();
    expect(item!.brand).toBeNull();
    expect(item!.categoryId).toBeNull();
    expect(item!.colour).toBeNull();
    expect(item!.gender).toBeNull(); // BF-15 regression: AI must never write the confirmed gender column

    const [generation] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, jobId));
    expect(generation!.status).toBe("completed");
    expect(generation!.provider).toBe("gemini");
    expect(generation!.costUsdMicros).toBe(160);
    expect(generation!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("escalates to anthropic on primary throw", async () => {
    const itemId = await createDraftWithPhoto();
    primaryGenerate.mockRejectedValue(new Error("gemini 503"));
    escalationGenerate.mockResolvedValue(providerResult(GOOD_RAW));

    const { jobId } = (await requestDraft(itemId)).json();
    await processAiDraftJob({ generationId: jobId, inventoryItemId: itemId, sellerId: userId });

    const [generation] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, jobId));
    expect(generation!.status).toBe("completed");
    expect(generation!.provider).toBe("anthropic");
    expect(escalationGenerate).toHaveBeenCalledTimes(1);
  });

  it("escalates on low confidence and fails when both are low", async () => {
    const itemId = await createDraftWithPhoto();
    primaryGenerate.mockResolvedValue(providerResult({ ...GOOD_RAW, confidence: 0.2 }));
    escalationGenerate.mockResolvedValue(providerResult({ ...GOOD_RAW, confidence: 0.25 }));

    const { jobId } = (await requestDraft(itemId)).json();
    await processAiDraftJob({ generationId: jobId, inventoryItemId: itemId, sellerId: userId });

    expect(escalationGenerate).toHaveBeenCalledTimes(1);
    const [generation] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, jobId));
    expect(generation!.status).toBe("failed");
    expect(generation!.error).toMatch(/below minimum/);
  });

  it("marks prohibited output as filtered; the client sees a failed shape", async () => {
    const itemId = await createDraftWithPhoto();
    primaryGenerate.mockResolvedValue(
      providerResult({
        ...GOOD_RAW,
        description: "Perfect 1:1 mirror quality copy. DM me on WhatsApp to pay outside the app.",
      }),
    );

    const { jobId } = (await requestDraft(itemId)).json();
    await processAiDraftJob({ generationId: jobId, inventoryItemId: itemId, sellerId: userId });

    const [generation] = await db.select().from(aiGenerations).where(eq(aiGenerations.id, jobId));
    expect(generation!.status).toBe("filtered");

    const poll = await authedRequest(
      sessionToken,
      "GET",
      `/api/v1/seller/drafts/${itemId}/ai-draft/${jobId}`,
    );
    expect(poll.json().status).toBe("failed"); // never exposes 'filtered' or the text
    expect(poll.json().suggestions).toBeNull();

    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
    expect(item!.aiTitle).toBeNull();
  });

  it("is idempotent on a pending generation", async () => {
    const itemId = await createDraftWithPhoto();
    const first = (await requestDraft(itemId)).json();
    const second = (await requestDraft(itemId)).json();
    expect(second.jobId).toBe(first.jobId);
  });

  it("enforces the 3-regenerate cap per listing", async () => {
    const itemId = await createDraftWithPhoto();
    // 3 completed regenerates already on record
    for (let i = 0; i < 3; i++) {
      await db.insert(aiGenerations).values({
        id: ulid(),
        sellerId: userId,
        inventoryItemId: itemId,
        trigger: "regenerate",
        provider: "gemini",
        model: "gemini-2.5-flash-lite",
        promptVersion: "v1",
        status: "completed",
      });
    }
    const res = await requestDraft(itemId, "regenerate");
    expect(res.statusCode).toBe(429);
    expect(res.json().message).toMatch(/Regenerate limit/);
  });

  it("failed/filtered regenerates do NOT consume the lifetime allowance", async () => {
    // Regression (review MEDIUM): a provider outage producing 3 failed
    // regenerates used to permanently burn the cap for the listing.
    const itemId = await createDraftWithPhoto();
    for (const status of ["failed", "failed", "filtered"]) {
      await db.insert(aiGenerations).values({
        id: ulid(),
        sellerId: userId,
        inventoryItemId: itemId,
        trigger: "regenerate",
        provider: "gemini",
        model: "gemini-2.5-flash-lite",
        promptVersion: "v1",
        status,
      });
    }
    const res = await requestDraft(itemId, "regenerate");
    expect(res.statusCode).toBe(202);
  });

  it("enforces the 20/day Sydney cap per seller", async () => {
    const itemId = await createDraftWithPhoto();
    for (let i = 0; i < 20; i++) {
      await db.insert(aiGenerations).values({
        id: ulid(),
        sellerId: userId,
        inventoryItemId: itemId,
        trigger: "auto",
        provider: "gemini",
        model: "gemini-2.5-flash-lite",
        promptVersion: "v1",
        status: "completed",
      });
    }
    const res = await requestDraft(itemId);
    expect(res.statusCode).toBe(429);
    expect(res.json().message).toMatch(/Daily AI draft limit/);
  });

  it("yesterday's generations do not count toward today's cap", async () => {
    const itemId = await createDraftWithPhoto();
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    for (let i = 0; i < 20; i++) {
      await db.insert(aiGenerations).values({
        id: ulid(),
        sellerId: userId,
        inventoryItemId: itemId,
        trigger: "auto",
        provider: "gemini",
        model: "gemini-2.5-flash-lite",
        promptVersion: "v1",
        status: "completed",
        createdAt: twoDaysAgo,
      });
    }
    const res = await requestDraft(itemId);
    expect(res.statusCode).toBe(202);
  });

  it("worker is a no-op on non-pending generations", async () => {
    const itemId = await createDraftWithPhoto();
    primaryGenerate.mockResolvedValue(providerResult(GOOD_RAW));
    const { jobId } = (await requestDraft(itemId)).json();
    await processAiDraftJob({ generationId: jobId, inventoryItemId: itemId, sellerId: userId });
    await processAiDraftJob({ generationId: jobId, inventoryItemId: itemId, sellerId: userId });
    expect(primaryGenerate).toHaveBeenCalledTimes(1);
  });

  it("other sellers cannot poll my job", async () => {
    const itemId = await createDraftWithPhoto();
    const { jobId } = (await requestDraft(itemId)).json();
    const { user: other, sessionToken: otherToken } = await signUpTestUser();
    await grantSellerRole(other.id);
    const res = await authedRequest(
      otherToken,
      "GET",
      `/api/v1/seller/drafts/${itemId}/ai-draft/${jobId}`,
    );
    expect(res.statusCode).toBe(404);
  });
});
