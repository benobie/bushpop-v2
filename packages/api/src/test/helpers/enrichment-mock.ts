import { vi } from "vitest";

export const MOCK_ENRICHMENT_RESPONSE = {
  title: "Vintage Levi's Mid-Wash Denim Jacket",
  description:
    "A classic mid-wash denim jacket in great condition. Features visible Levi's logo on the back tab. Button-front closure with two chest pockets.",
  tags: ["vintage", "streetwear", "casual"],
  suggestedCategory: "outerwear",
  suggestedColour: "blue",
  suggestedMaterial: "denim",
  confidence: 0.92,
};

export function mockClaudeClient(
  overrides?: Partial<typeof MOCK_ENRICHMENT_RESPONSE>,
) {
  const response = { ...MOCK_ENRICHMENT_RESPONSE, ...overrides };
  return {
    getClaudeClient: vi.fn(() => ({
      messages: {
        create: vi.fn(async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify(response),
            },
          ],
        })),
      },
    })),
  };
}

export function mockEnrichmentQueue() {
  const addFn = vi.fn(async () => ({ id: "mock-job-id" }));
  const getJobFn = vi.fn(async () => null);

  return {
    getEnrichmentQueue: vi.fn(() => ({
      add: addFn,
      getJob: getJobFn,
    })),
    enqueueEnrichment: vi.fn(async () => {}),
    ENRICHMENT_QUEUE: "ai-enrichment",
    _addFn: addFn,
    _getJobFn: getJobFn,
  };
}
