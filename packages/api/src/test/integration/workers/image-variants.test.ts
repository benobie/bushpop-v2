import { describe, expect, it, beforeEach, vi } from "vitest";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { user } from "@bushpop/db/schema";
import { inventoryItems, inventoryItemImages } from "@bushpop/db/schema";
import { ulid } from "ulid";

// In-memory R2: seeded originals, records every Put.
const r2Store = new Map<string, { body: Buffer; contentType?: string }>();

vi.mock("../../../lib/r2.js", () => ({
  getR2Client: () => ({
    send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const name = cmd.constructor.name;
      const input = cmd.input as { Key: string; Body?: Buffer; ContentType?: string };
      if (name === "GetObjectCommand") {
        const obj = r2Store.get(input.Key);
        if (!obj) throw new Error(`NoSuchKey: ${input.Key}`);
        return {
          Body: (async function* () {
            yield new Uint8Array(obj.body);
          })(),
          ContentType: obj.contentType,
        };
      }
      if (name === "PutObjectCommand") {
        r2Store.set(input.Key, {
          body: Buffer.from(input.Body!),
          contentType: input.ContentType,
        });
        return {};
      }
      throw new Error(`Unexpected command: ${name}`);
    },
  }),
}));

import { processImageVariantsJob, IMAGE_VARIANTS } from "../../../workers/image-variants.js";

async function makeTestRow() {
  const userId = ulid();
  await db.insert(user).values({
    id: userId,
    name: "Variant Seller",
    email: `variants-${userId}@test.local`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [item] = await db
    .insert(inventoryItems)
    .values({ ownerId: userId, title: "Variant test item" })
    .returning();
  const imageId = ulid();
  const storageKey = `items/${item!.id}/${imageId}.jpg`;
  await db.insert(inventoryItemImages).values({
    id: imageId,
    inventoryItemId: item!.id,
    storageKey,
    status: "ready",
  });
  return { itemId: item!.id, imageId, storageKey };
}

describe("image-variants worker", () => {
  beforeEach(() => {
    r2Store.clear();
    process.env.R2_BUCKET_NAME = "test-bucket";
  });

  it("generates thumb-320 / card-800 / pdp-1600 WebP variants", async () => {
    const { itemId, imageId, storageKey } = await makeTestRow();
    const original = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 40, g: 120, b: 80 } },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
    r2Store.set(storageKey, { body: original, contentType: "image/jpeg" });

    await processImageVariantsJob({ imageId, storageKey });

    for (const variant of IMAGE_VARIANTS) {
      const key = `items/${itemId}/${variant.name}/${imageId}.webp`;
      const stored = r2Store.get(key);
      expect(stored, `${variant.name} should exist`).toBeDefined();
      expect(stored!.contentType).toBe("image/webp");
      const meta = await sharp(stored!.body).metadata();
      expect(meta.format).toBe("webp");
      expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(variant.edge);
    }

    // pdp-1600 must not enlarge a 1200px original
    const pdp = r2Store.get(`items/${itemId}/pdp-1600/${imageId}.webp`)!;
    const pdpMeta = await sharp(pdp.body).metadata();
    expect(pdpMeta.width).toBe(1200);
  });

  it("writes the aspect ratio to the image row (conditional)", async () => {
    const { imageId, storageKey } = await makeTestRow();
    const original = await sharp({
      create: { width: 1000, height: 500, channels: 3, background: "#333" },
    })
      .jpeg()
      .toBuffer();
    r2Store.set(storageKey, { body: original, contentType: "image/jpeg" });

    await processImageVariantsJob({ imageId, storageKey });

    const [row] = await db
      .select()
      .from(inventoryItemImages)
      .where(eq(inventoryItemImages.id, imageId));
    expect(Number(row!.aspectRatio)).toBeCloseTo(2.0, 3);
  });

  it("re-writes the original stripped when EXIF is present", async () => {
    const { imageId, storageKey } = await makeTestRow();
    const withExif = await sharp({
      create: { width: 600, height: 400, channels: 3, background: "#888" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 }) // writes an EXIF block
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    r2Store.set(storageKey, { body: withExif, contentType: "image/jpeg" });

    await processImageVariantsJob({ imageId, storageKey });

    const rewritten = r2Store.get(storageKey)!;
    const meta = await sharp(rewritten.body).metadata();
    expect(meta.exif).toBeUndefined();
    // orientation 6 = 90° rotation — auto-orient bakes it in: 600x400 → 400x600
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(600);
  });

  it("leaves an EXIF-free original untouched", async () => {
    const { imageId, storageKey } = await makeTestRow();
    const clean = await sharp({
      create: { width: 600, height: 400, channels: 3, background: "#888" },
    })
      .jpeg()
      .toBuffer();
    r2Store.set(storageKey, { body: clean, contentType: "image/jpeg" });

    await processImageVariantsJob({ imageId, storageKey });

    expect(r2Store.get(storageKey)!.body.equals(clean)).toBe(true);
  });

  it("rejects malformed storage keys without retrying", async () => {
    // NonRetryableError is swallowed by the worker wrapper; the raw
    // processor should throw so the wrapper can classify it.
    await expect(
      processImageVariantsJob({ imageId: "x", storageKey: "not-items/whatever" }),
    ).rejects.toThrow(/Cannot derive/);
  });
});
