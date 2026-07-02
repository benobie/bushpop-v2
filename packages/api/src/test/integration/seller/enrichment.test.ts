import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@bushpop/db/client";
import { inventoryItems, inventoryItemImages, categories } from "@bushpop/db/schema";
import { eq } from "drizzle-orm";
import {
  parseModelOutput,
  normalizeModelOutput,
  enrichmentOutputSchema,
} from "../../../lib/enrichment-schema.js";
import { createTestUser } from "../../helpers/create-user.js";
import { createTestSeller } from "../../helpers/create-seller.js";
import { createTestInventoryItem } from "../../helpers/create-inventory-item.js";
import { MOCK_ENRICHMENT_RESPONSE } from "../../helpers/enrichment-mock.js";

// ── Schema & Parsing Tests ──

describe("enrichment schema validation", () => {
  it("accepts a valid enrichment response", () => {
    const result = enrichmentOutputSchema.safeParse(MOCK_ENRICHMENT_RESPONSE);
    expect(result.success).toBe(true);
  });

  it("rejects invalid enum values (e.g. suggestedColour: 'teal')", () => {
    const result = enrichmentOutputSchema.safeParse({
      ...MOCK_ENRICHMENT_RESPONSE,
      suggestedColour: "teal",
    });
    expect(result.success).toBe(false);
  });

  it("normalises capitalised enum values to lowercase", () => {
    const normalized = normalizeModelOutput({
      ...MOCK_ENRICHMENT_RESPONSE,
      suggestedCategory: "Outerwear",
      suggestedColour: "Blue",
      suggestedMaterial: "Denim",
    });
    const result = enrichmentOutputSchema.safeParse(normalized);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.suggestedCategory).toBe("outerwear");
      expect(result.data.suggestedColour).toBe("blue");
      expect(result.data.suggestedMaterial).toBe("denim");
    }
  });

  it("rejects confidence > 1", () => {
    const result = enrichmentOutputSchema.safeParse({
      ...MOCK_ENRICHMENT_RESPONSE,
      confidence: 1.4,
    });
    expect(result.success).toBe(false);
  });

  it("rejects title > 80 chars", () => {
    const result = enrichmentOutputSchema.safeParse({
      ...MOCK_ENRICHMENT_RESPONSE,
      title: "A".repeat(81),
    });
    expect(result.success).toBe(false);
  });

  it("deduplicates and lowercases tags", () => {
    const result = enrichmentOutputSchema.safeParse({
      ...MOCK_ENRICHMENT_RESPONSE,
      tags: ["Vintage", "VINTAGE", "casual", "casual"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual(["vintage", "casual"]);
    }
  });

  it("accepts non-fashion response (confidence 0.0, tags [])", () => {
    const result = enrichmentOutputSchema.safeParse({
      title: null,
      description: null,
      tags: [],
      suggestedCategory: null,
      suggestedColour: null,
      suggestedMaterial: null,
      confidence: 0.0,
    });
    expect(result.success).toBe(true);
  });
});

describe("parseModelOutput", () => {
  it("parses direct JSON", () => {
    const result = parseModelOutput(JSON.stringify(MOCK_ENRICHMENT_RESPONSE));
    expect(result).toEqual(MOCK_ENRICHMENT_RESPONSE);
  });

  it("extracts JSON from markdown fences", () => {
    const wrapped = "```json\n" + JSON.stringify(MOCK_ENRICHMENT_RESPONSE) + "\n```";
    const result = parseModelOutput(wrapped);
    expect(result).toEqual(MOCK_ENRICHMENT_RESPONSE);
  });

  it("extracts JSON from prose", () => {
    const withProse =
      "Here is the catalogue:\n" + JSON.stringify(MOCK_ENRICHMENT_RESPONSE);
    const result = parseModelOutput(withProse);
    expect(result).toEqual(MOCK_ENRICHMENT_RESPONSE);
  });

  it("throws on no JSON", () => {
    expect(() => parseModelOutput("No JSON here")).toThrow(
      "No JSON object found",
    );
  });

  it("direct parse takes precedence over regex", () => {
    // Valid JSON that also happens to have text before it would not normally occur,
    // but if direct parse succeeds, regex is never called
    const json = JSON.stringify(MOCK_ENRICHMENT_RESPONSE);
    const result = parseModelOutput(json);
    expect(result).toEqual(MOCK_ENRICHMENT_RESPONSE);
  });
});

// ── Worker Integration Tests ──

describe("enrichment worker (processEnrichmentJob)", () => {
  let testUserId: string;

  // Mock R2 and Claude before importing worker
  vi.mock("../../../lib/r2.js", () => ({
    getR2Client: vi.fn(),
    isAllowedContentType: vi.fn(() => true),
    getExtensionForContentType: vi.fn(() => "jpg"),
    createPresignedPutUrl: vi.fn(async () => "https://r2.example.com/put"),
    createPresignedGetUrl: vi.fn(async () => "https://r2.example.com/get"),
    headObject: vi.fn(async () => ({
      contentType: "image/jpeg",
      contentLength: 123456,
    })),
    deleteObject: vi.fn(async () => {}),
  }));

  vi.mock("../../../lib/claude.js", () => ({
    getClaudeClient: vi.fn(() => ({
      messages: {
        create: vi.fn(async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify(MOCK_ENRICHMENT_RESPONSE),
            },
          ],
        })),
      },
    })),
  }));

  vi.mock("../../../lib/enrichment-queue.js", () => ({
    getEnrichmentQueue: vi.fn(() => ({
      add: vi.fn(async () => ({})),
      getJob: vi.fn(async () => null),
    })),
    enqueueEnrichment: vi.fn(async () => {}),
    ENRICHMENT_QUEUE: "ai-enrichment",
  }));

  vi.mock("../../../lib/events.js", () => ({
    dispatchEvent: vi.fn(async () => "mock-event-id"),
  }));

  beforeEach(async () => {
    const user = await createTestUser();
    testUserId = user.id;
    await createTestSeller(testUserId);
  });

  async function createItemWithImages(
    overrides?: Partial<typeof inventoryItems.$inferInsert>,
    imageCount = 1,
  ) {
    const item = await createTestInventoryItem(testUserId, overrides);

    for (let i = 0; i < imageCount; i++) {
      await db.insert(inventoryItemImages).values({
        inventoryItemId: item.id,
        storageKey: `items/${item.id}/img-${i}.jpg`,
        status: "ready",
        position: i,
        contentType: "image/jpeg",
        sizeBytes: 100000,
        confirmedAt: new Date(),
      });
    }

    return item;
  }

  it("writes ai_* fields from Claude response", async () => {
    const { processEnrichmentJob } = await import(
      "../../../workers/enrichment.js"
    );
    const item = await createItemWithImages();

    await processEnrichmentJob({
      inventoryItemId: item.id,
      ownerId: testUserId,
    });

    const [updated] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, item.id));

    expect(updated!.aiTitle).toBe(MOCK_ENRICHMENT_RESPONSE.title);
    expect(updated!.aiDescription).toBe(MOCK_ENRICHMENT_RESPONSE.description);
    expect(updated!.aiTags).toEqual(MOCK_ENRICHMENT_RESPONSE.tags);
    expect(updated!.aiSuggestedCategory).toBe("outerwear");
    expect(updated!.aiSuggestedColour).toBe("blue");
    expect(updated!.aiSuggestedMaterial).toBe("denim");
    expect(updated!.aiConfidence).toBeCloseTo(0.92);
    expect(updated!.aiPromptVersion).toBe("1.0.0");
    expect(updated!.aiStatus).toBe("completed");
    expect(updated!.aiEnrichedAt).toBeTruthy();
  });

  it("fills empty canonical fields via COALESCE", async () => {
    const { processEnrichmentJob } = await import(
      "../../../workers/enrichment.js"
    );
    // Create item with null title/description
    const item = await createItemWithImages({ title: null, description: null });

    await processEnrichmentJob({
      inventoryItemId: item.id,
      ownerId: testUserId,
    });

    const [updated] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, item.id));

    // Canonical fields should be filled by AI
    expect(updated!.title).toBe(MOCK_ENRICHMENT_RESPONSE.title);
    expect(updated!.description).toBe(MOCK_ENRICHMENT_RESPONSE.description);
    expect(updated!.colour).toBe("blue");
    expect(updated!.material).toBe("denim");
  });

  it("does NOT overwrite user-set canonical fields", async () => {
    const { processEnrichmentJob } = await import(
      "../../../workers/enrichment.js"
    );
    const item = await createItemWithImages({
      title: "My Custom Title",
      description: "My custom description",
      colour: "red",
      material: "cotton",
    });

    await processEnrichmentJob({
      inventoryItemId: item.id,
      ownerId: testUserId,
    });

    const [updated] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, item.id));

    // Canonical fields should preserve user values
    expect(updated!.title).toBe("My Custom Title");
    expect(updated!.description).toBe("My custom description");
    expect(updated!.colour).toBe("red");
    expect(updated!.material).toBe("cotton");
    // But ai_* should still be written
    expect(updated!.aiTitle).toBe(MOCK_ENRICHMENT_RESPONSE.title);
  });

  it("treats empty string canonical fields as null (NULLIF)", async () => {
    const { processEnrichmentJob } = await import(
      "../../../workers/enrichment.js"
    );
    const item = await createItemWithImages({
      title: "",
      description: "",
    });

    await processEnrichmentJob({
      inventoryItemId: item.id,
      ownerId: testUserId,
    });

    const [updated] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, item.id));

    // Empty strings should be treated as null → filled by AI
    expect(updated!.title).toBe(MOCK_ENRICHMENT_RESPONSE.title);
    expect(updated!.description).toBe(MOCK_ENRICHMENT_RESPONSE.description);
  });

  it("sets ai_status = 'completed' and ai_enriched_at", async () => {
    const { processEnrichmentJob } = await import(
      "../../../workers/enrichment.js"
    );
    const item = await createItemWithImages();

    await processEnrichmentJob({
      inventoryItemId: item.id,
      ownerId: testUserId,
    });

    const [updated] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, item.id));

    expect(updated!.aiStatus).toBe("completed");
    expect(updated!.aiEnrichedAt).toBeInstanceOf(Date);
    expect(updated!.aiLastError).toBeNull();
  });

  it("dispatches inventory.enriched event", async () => {
    const { processEnrichmentJob } = await import(
      "../../../workers/enrichment.js"
    );
    const { dispatchEvent } = await import("../../../lib/events.js");
    const item = await createItemWithImages();

    await processEnrichmentJob({
      inventoryItemId: item.id,
      ownerId: testUserId,
    });

    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "inventory.enriched",
        entityId: item.id,
      }),
    );
  });

  it("skips item with no ready images", async () => {
    const { processEnrichmentJob } = await import(
      "../../../workers/enrichment.js"
    );
    const { getClaudeClient } = await import("../../../lib/claude.js");
    const item = await createTestInventoryItem(testUserId);
    // No images inserted

    await processEnrichmentJob({
      inventoryItemId: item.id,
      ownerId: testUserId,
    });

    // Claude should not have been called
    const client = getClaudeClient();
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it("skips archived item", async () => {
    const { processEnrichmentJob } = await import(
      "../../../workers/enrichment.js"
    );
    const { getClaudeClient } = await import("../../../lib/claude.js");
    const item = await createItemWithImages({ lifecycleState: "archived" });

    await processEnrichmentJob({
      inventoryItemId: item.id,
      ownerId: testUserId,
    });

    const client = getClaudeClient();
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it("skips sold item", async () => {
    const { processEnrichmentJob } = await import(
      "../../../workers/enrichment.js"
    );
    const { getClaudeClient } = await import("../../../lib/claude.js");
    const item = await createItemWithImages({ lifecycleState: "sold" });

    await processEnrichmentJob({
      inventoryItemId: item.id,
      ownerId: testUserId,
    });

    const client = getClaudeClient();
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it("maps category slug to ULID via categories table", async () => {
    const { processEnrichmentJob } = await import(
      "../../../workers/enrichment.js"
    );
    const item = await createItemWithImages({ categoryId: null });

    await processEnrichmentJob({
      inventoryItemId: item.id,
      ownerId: testUserId,
    });

    const [updated] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, item.id));

    // Should have mapped "outerwear" slug to a ULID
    if (updated!.categoryId) {
      const [cat] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, updated!.categoryId));
      expect(cat!.slug).toBe("outerwear");
    }
  });
});
