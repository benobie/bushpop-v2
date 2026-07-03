import { Queue, Worker } from "bullmq";
import { and, eq, isNull } from "drizzle-orm";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { db } from "@bushpop/db/client";
import { inventoryItemImages } from "@bushpop/db/schema";
import { getRedis } from "../lib/redis.js";
import { getR2Client } from "../lib/r2.js";

/**
 * Image-variants worker — decoupled from AI enrichment (Phase 1 task 3).
 *
 * Previously variant generation lived inside the enrichment worker, which
 * only ran when ANTHROPIC_API_KEY was set — a Gemini-only config would ship
 * with zero thumbnails. This queue is enqueued UNCONDITIONALLY from
 * confirmUpload and runs with no AI key at all.
 *
 * Per original `items/{itemId}/{imageId}.{ext}` it writes WebP q85 variants:
 *   items/{itemId}/thumb-320/{imageId}.webp   — browse cards / wizard thumbs
 *   items/{itemId}/card-800/{imageId}.webp    — shop cards / gallery
 *   items/{itemId}/pdp-1600/{imageId}.webp    — PDP hero / zoom
 *
 * It also EXIF-verifies the original: client-side compression should have
 * stripped metadata (re-encode), but if EXIF survives (direct API upload,
 * Safari fallback edge cases) the original is re-written stripped —
 * auto-oriented first so pixels don't rotate — and the event is logged.
 *
 * Publish blocks only on the ORIGINAL being ready (existing engine
 * semantics) — variants land asynchronously.
 */

export const IMAGE_VARIANTS_QUEUE = "image-variants";

export const IMAGE_VARIANTS = [
  { name: "thumb-320", edge: 320 },
  { name: "card-800", edge: 800 },
  { name: "pdp-1600", edge: 1600 },
] as const;

const WEBP_QUALITY = 85;

export interface ImageVariantsJobData {
  imageId: string;
  storageKey: string;
}

class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

let variantsQueue: Queue | null = null;

export function getImageVariantsQueue(): Queue {
  if (!variantsQueue) {
    variantsQueue = new Queue(IMAGE_VARIANTS_QUEUE, { connection: getRedis() });
  }
  return variantsQueue;
}

export async function enqueueImageVariants(
  imageId: string,
  storageKey: string,
): Promise<void> {
  await getImageVariantsQueue().add(
    "generate-variants",
    { imageId, storageKey } satisfies ImageVariantsJobData,
    {
      jobId: `variants-${imageId}`,
      removeOnComplete: true,
      removeOnFail: { count: 25 },
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
    },
  );
}

async function readBody(body: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function processImageVariantsJob(
  data: ImageVariantsJobData,
): Promise<void> {
  const { imageId, storageKey } = data;
  const r2 = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME!;

  // storageKey layout: items/{itemId}/{imageId}.{ext}
  const parts = storageKey.split("/");
  const itemId = parts[1];
  const filename = parts[parts.length - 1]!;
  const keyImageId = filename.split(".")[0];
  if (parts[0] !== "items" || !itemId || !keyImageId) {
    throw new NonRetryableError(
      `[image-variants] Cannot derive itemId/imageId from storageKey: ${storageKey}`,
    );
  }

  // The image may have been deleted between confirm and this job running —
  // generating variants for a deleted image would recreate R2 objects that
  // nothing can ever clean up (review finding). Small race remains between
  // this check and the Puts; acceptable for a best-effort variant.
  const [row] = await db
    .select({ id: inventoryItemImages.id })
    .from(inventoryItemImages)
    .where(eq(inventoryItemImages.id, imageId));
  if (!row) {
    console.info(`[image-variants] Image ${imageId} deleted before variants ran — skipping`);
    return;
  }

  const getRes = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
  if (!getRes.Body) {
    throw new Error(`[image-variants] Empty body for ${storageKey}`);
  }
  let inputBuffer = await readBody(getRes.Body as AsyncIterable<Uint8Array>);

  const metadata = await sharp(inputBuffer).metadata();

  // EXIF verification: the original should already be metadata-free
  // (client re-encode strips it). If EXIF survived, auto-orient + re-encode
  // (sharp drops metadata unless asked to keep it) and overwrite in place.
  if (metadata.exif) {
    const strippedBuffer = await sharp(inputBuffer).rotate().toBuffer();
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: strippedBuffer,
        ContentType: getRes.ContentType ?? `image/${metadata.format ?? "jpeg"}`,
      }),
    );
    console.warn(
      `[image-variants] EXIF found on ${storageKey} — original re-written stripped (${inputBuffer.length} → ${strippedBuffer.length} bytes)`,
    );
    inputBuffer = strippedBuffer;
  }

  // Aspect ratio for CLS prevention. EXIF orientations 5–8 are 90°/270°
  // rotations — reported width/height are pre-rotation, so swap.
  const rawWidth = metadata.width ?? 1;
  const rawHeight = metadata.height ?? 1;
  const rotated = (metadata.orientation ?? 1) >= 5;
  const aspectRatio = rotated ? rawHeight / rawWidth : rawWidth / rawHeight;

  for (const variant of IMAGE_VARIANTS) {
    const variantKey = `items/${itemId}/${variant.name}/${keyImageId}.webp`;
    const variantBuffer = await sharp(inputBuffer)
      .rotate() // no-op on stripped originals; auto-orients any stragglers
      .resize({
        width: variant.edge,
        height: variant.edge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: variantKey,
        Body: variantBuffer,
        ContentType: "image/webp",
      }),
    );
  }

  // Conditional write — don't clobber an existing aspect ratio.
  await db
    .update(inventoryItemImages)
    .set({ aspectRatio: String(aspectRatio) })
    .where(
      and(
        eq(inventoryItemImages.id, imageId),
        isNull(inventoryItemImages.aspectRatio),
      ),
    );

  console.info(
    `[image-variants] Variants generated for ${storageKey} (aspect_ratio=${aspectRatio.toFixed(4)})`,
  );
}

export function startImageVariantsWorker(): Worker {
  const worker = new Worker<ImageVariantsJobData>(
    IMAGE_VARIANTS_QUEUE,
    async (job) => {
      try {
        await processImageVariantsJob(job.data);
      } catch (err) {
        if (err instanceof NonRetryableError) {
          console.error(`[image-variants] Non-retryable error:`, err.message);
          return;
        }
        throw err;
      }
    },
    {
      connection: getRedis(),
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[image-variants] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
