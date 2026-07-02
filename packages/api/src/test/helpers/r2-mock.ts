import { vi } from "vitest";

/**
 * Mock the R2 module for tests.
 * Call this in your test file before importing anything that uses R2.
 *
 * Usage:
 *   vi.mock("../../lib/r2.js", () => mockR2());
 */
export function mockR2(): Record<string, unknown> {
  return {
    getR2Client: vi.fn(),
    isAllowedContentType: vi.fn((ct: string) =>
      ["image/jpeg", "image/png", "image/webp"].includes(ct),
    ),
    getExtensionForContentType: vi.fn((ct: string) => {
      const map: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      };
      return map[ct] ?? "bin";
    }),
    createPresignedPutUrl: vi.fn(async () => "https://r2.example.com/presigned-put-url"),
    headObject: vi.fn(async () => ({
      contentType: "image/jpeg",
      contentLength: 123456,
    })),
    deleteObject: vi.fn(async () => {}),
  };
}
