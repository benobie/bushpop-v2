/**
 * Local dev uses placeholder R2 credentials, so two upload-boundary calls are
 * faked here and everything else stays real: the browser's presigned PUT to
 * Cloudflare R2 and the browser-facing draft-image `/confirm` response.
 *
 * The real backend only flips an image row to `ready` inside `/confirm`, so the
 * confirm intercept also mirrors that state change in the fixture DB before it
 * fulfills the response. That keeps the wizard's follow-up real draft GET and
 * the final real publish call aligned with the skipped R2 HeadObject-backed
 * handler, without intercepting any other app/API traffic.
 */
import { expect, test as base, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { inventoryItemImages, inventoryItems } from "@bushpop/db/schema";
import { closeFixtureDb, createAuthenticatedSeller } from "./fixtures/auth";

const BASE_URL = "http://localhost:3002";
const ACTIVE_STEP_SELECTOR = ".step[aria-current='step'] .label";
const LISTING_PHOTO_SELECTOR = "img[alt^='Listing photo ']";
const R2_UPLOAD_SIZE_LIMIT_BYTES = 450_000;

const STEP_LABELS = {
  photos: "Photos",
  details: "Details",
  condition: "Condition",
  price: "Price",
  shipping: "Shipping",
  review: "Review",
} as const;

type SellerStorageState = Awaited<ReturnType<typeof createAuthenticatedSeller>>["storageState"];
type Step = keyof typeof STEP_LABELS;

type UploadPayload = {
  name: string;
  mimeType: "image/jpeg";
  buffer: Buffer;
};

type UploadCapture = {
  imageId: string;
  contentType: string;
  sizeBytes: number;
};

type UploadHarness = {
  putUploads: UploadCapture[];
};

const test = base.extend<
  { storageState: SellerStorageState },
  { sellerStorageState: SellerStorageState }
>({
  // Worker-scoped: one real sign-up for every test in this file/worker,
  // not one per test. The auth endpoint is real-rate-limited (10/min) —
  // one seller per test case blew through that budget and 429'd.
  sellerStorageState: [
    // Playwright fixture functions require a destructured first param even
    // with no deps.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const { storageState } = await createAuthenticatedSeller(BASE_URL);
      await use(storageState);
    },
    { scope: "worker" },
  ],
  storageState: async ({ sellerStorageState }, use) => {
    await use(sellerStorageState);
  },
});

test.afterAll(async () => {
  await closeFixtureDb();
});

test("publishes the sell wizard happy path against the real drafts API", async ({ page }) => {
  const uploadHarness = await installUploadInterceptors(page);

  await gotoSellWizard(page);
  await expectStep(page, "photos");

  const heroPhoto = await createDeterministicJpeg(page, {
    name: "happy-path.jpg",
    width: 1600,
    height: 1200,
    seed: 1,
  });

  await uploadPhotos(page, [heroPhoto], 1);
  expect(uploadHarness.putUploads[0]?.sizeBytes ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
    R2_UPLOAD_SIZE_LIMIT_BYTES,
  );

  await page.getByRole("button", { name: "Continue" }).click();
  await expectStep(page, "details");

  await fillDetailsStep(page);

  await page.getByRole("button", { name: "Continue" }).click();
  await expectStep(page, "condition");

  await fillConditionStep(page);

  await page.getByRole("button", { name: "Continue" }).click();
  await expectStep(page, "price");

  await fillPriceStep(page);

  await page.getByRole("button", { name: "Continue" }).click();
  await expectStep(page, "shipping");

  await fillShippingStep(page);

  await page.getByRole("button", { name: "Continue" }).click();
  await expectStep(page, "review");

  const publishButton = page.getByRole("button", { name: "Publish" });

  await page.getByRole("checkbox").check();
  await expect(publishButton).toBeEnabled({ timeout: 30_000 });
  await publishButton.click();

  await expect(page.getByRole("button", { name: "List another" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/Strength locked at/)).toBeVisible();
});

test("shows the small-photo advisory without blocking progress", async ({ page }) => {
  await installUploadInterceptors(page);
  await gotoSellWizard(page);

  const smallPhoto = await createDeterministicJpeg(page, {
    name: "small-photo.jpg",
    width: 600,
    height: 600,
    seed: 2,
  });

  await uploadPhotos(page, [smallPhoto], 1);

  await expect(page.getByText("Small photo", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Continue" }).click();
  await expectStep(page, "details");
});

test("reorders uploaded photos end to end via the move buttons", async ({ page }) => {
  // Native HTML5 drag-and-drop is intentionally not exercised here. The move
  // buttons drive the same reorder/save path with far less Playwright flake.
  await installUploadInterceptors(page);
  await gotoSellWizard(page);

  const firstPhoto = await createDeterministicJpeg(page, {
    name: "cover-one.jpg",
    width: 1400,
    height: 1200,
    seed: 3,
  });
  const secondPhoto = await createDeterministicJpeg(page, {
    name: "cover-two.jpg",
    width: 1400,
    height: 1200,
    seed: 4,
  });

  await uploadPhotos(page, [firstPhoto], 1);
  await uploadPhotos(page, [secondPhoto], 2);

  const thumbs = page.locator(".thumbs .thumb");
  await expect(thumbs).toHaveCount(2, { timeout: 30_000 });
  await expect(thumbs.nth(0).locator(".cover")).toBeVisible();

  await page.getByRole("button", { name: "Move photo 1 right" }).click();

  await expect(page.locator(".thumbs .thumb").nth(0).locator(".cover")).toHaveCount(0);
  await expect(page.locator(".thumbs .thumb").nth(1).locator(".cover")).toBeVisible();
});

test.describe("mobile viewport sticky nav", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps the bottom nav visible on mobile without scrolling", async ({ page }) => {
    await gotoSellWizard(page);

    // SellWizard mounts every step's panel (CSS shows only the active one via
    // `.panel.on`), so ReviewStep's own `.wnav` (hidden here, off-screen) is
    // ALWAYS in the DOM ahead of the generic wizard nav in document order —
    // `.last()` reliably targets the visible generic bottom bar regardless
    // of the current step.
    await expect(page.locator(".sell-wizard .wnav").last()).toBeInViewport();
    await expect(page.getByRole("button", { name: "Continue" })).toBeInViewport();
  });
});

test.describe("reduced motion", () => {
  test("does not crash and still advances through details without pulse animation", async ({
    browser,
    sellerStorageState,
  }) => {
    const context = await browser.newContext({
      storageState: sellerStorageState,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error);
    });

    try {
      await installUploadInterceptors(page);
      await gotoSellWizard(page);

      const photo = await createDeterministicJpeg(page, {
        name: "reduced-motion.jpg",
        width: 1600,
        height: 1200,
        seed: 5,
      });

      await uploadPhotos(page, [photo], 1);
      await page.getByRole("button", { name: "Continue" }).click();
      await expectStep(page, "details");

      await fillDetailsStep(page);

      const continueButton = page.getByRole("button", { name: "Continue" });
      await expect(continueButton).not.toHaveClass(/(^| )ready( |$)/);

      await continueButton.click();
      await expectStep(page, "condition");
      expect(pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

test("resumes the real draft after a refresh", async ({ page }) => {
  await installUploadInterceptors(page);
  await gotoSellWizard(page);

  // The shared strength rubric (@bushpop/config computeListingStrength)
  // keeps "photos" in strength.missing until 4 photos exist (5pts each,
  // capped at 4) — resolveResumeStep opens the lowest-step missing item, so
  // with fewer than 4 photos resume always re-lands on the photos step
  // regardless of how much further the seller actually got. Upload 4 so
  // this test proves resume-to-furthest-real-progress (condition), not the
  // photos-nudge behaviour (which is real and correct, just a different
  // scenario than "resume after finishing photos+details").
  const photos = await Promise.all(
    [1, 2, 3, 4].map((seed) =>
      createDeterministicJpeg(page, {
        name: `resume-photo-${seed}.jpg`,
        width: 1500,
        height: 1200,
        seed,
      }),
    ),
  );

  await uploadPhotos(page, photos, 4);
  await page.getByRole("button", { name: "Continue" }).click();
  await expectStep(page, "details");

  await fillDetailsStep(page);

  await page.getByRole("button", { name: "Continue" }).click();
  await expectStep(page, "condition");

  await page.reload();

  await expect(page.getByText(/You have a draft from/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Resume" }).click();
  await expectStep(page, "condition");
});

test("wobbles the publish checklist when review is still gated", async ({ page }) => {
  await gotoSellWizard(page);

  await page.getByRole("button", { name: /Review/ }).click();
  await expectStep(page, "review");

  await page.getByTestId("publish-wrap").click();

  await expect(page.getByTestId("review-checklist")).toHaveClass(/(^| )wobble( |$)/);
  await expect(page.getByRole("status")).toContainText("Almost - tick off the red items first");
});

async function installUploadInterceptors(page: Page): Promise<UploadHarness> {
  const uploadsByImageId = new Map<string, UploadCapture>();
  const putUploads: UploadCapture[] = [];

  await page.route(
    (url) => url.hostname.endsWith("r2.cloudflarestorage.com"),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const imageId = url.pathname.split("/").pop()?.split(".")[0] ?? "unknown-image";
      const sizeBytes = request.postDataBuffer()?.length ?? 0;
      const contentType = request.headers()["content-type"] ?? "image/jpeg";
      const capture = {
        imageId,
        contentType,
        sizeBytes,
      } satisfies UploadCapture;

      uploadsByImageId.set(imageId, capture);
      putUploads.push(capture);

      await route.fulfill({ status: 200, body: "" });
    },
  );

  await page.route("**/api/v1/seller/drafts/*/images/*/confirm", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathParts = url.pathname.split("/");
    const draftId = pathParts[pathParts.indexOf("drafts") + 1] ?? "";
    const imageId = pathParts[pathParts.indexOf("images") + 1] ?? "";
    const body = JSON.parse(request.postData() ?? "{}") as {
      isPrimary: boolean;
      position: number;
    };
    const capturedUpload = uploadsByImageId.get(imageId);
    const now = new Date();

    if (body.isPrimary) {
      await db
        .update(inventoryItemImages)
        .set({ isPrimary: false })
        .where(eq(inventoryItemImages.inventoryItemId, draftId));
    }

    await db
      .update(inventoryItemImages)
      .set({
        contentType: capturedUpload?.contentType ?? "image/jpeg",
        sizeBytes: capturedUpload?.sizeBytes ?? 400_000,
        status: "ready",
        position: body.position,
        isPrimary: body.isPrimary,
        confirmedAt: now,
      })
      .where(
        and(
          eq(inventoryItemImages.id, imageId),
          eq(inventoryItemImages.inventoryItemId, draftId),
        ),
      );

    await db
      .update(inventoryItems)
      .set({ updatedAt: now })
      .where(eq(inventoryItems.id, draftId));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: imageId,
        url: "https://images.example.test/original.jpg",
        contentType: capturedUpload?.contentType ?? "image/jpeg",
        sizeBytes: capturedUpload?.sizeBytes ?? 400_000,
        status: "ready",
        position: body.position,
        isPrimary: body.isPrimary,
        confirmedAt: now.toISOString(),
        createdAt: now.toISOString(),
      }),
    });
  });

  return { putUploads };
}

/**
 * All tests in this file share one seller (see the worker-scoped
 * `sellerStorageState` fixture — the real sign-up endpoint is rate-limited,
 * so one sign-up per file beats one per test). Any test that doesn't
 * publish leaves an "owned" draft behind, which means a LATER test's first
 * `/sell` visit can land on the real resume/start-fresh choice banner
 * instead of a clean wizard. Clear that banner with "Start fresh" before
 * asserting on wizard state, so each test starts from a known-empty draft
 * regardless of run order.
 */
async function gotoSellWizard(page: Page): Promise<void> {
  await page.goto("/sell");

  const startFreshButton = page.getByRole("button", { name: "Start fresh" });
  const continueButton = page.getByRole("button", { name: "Continue" });

  await expect(startFreshButton.or(continueButton)).toBeVisible({ timeout: 30_000 });

  if (await startFreshButton.isVisible()) {
    await startFreshButton.click();
  }

  await expect(continueButton).toBeVisible({ timeout: 30_000 });
  await expectStep(page, "photos");
}

async function expectStep(page: Page, step: Step): Promise<void> {
  await expect(page).toHaveURL(new RegExp(String.raw`/sell\?step=${step}(?:$|&)`));
  await expect(page.locator(ACTIVE_STEP_SELECTOR)).toHaveText(STEP_LABELS[step]);
}

async function createDeterministicJpeg(
  page: Page,
  options: {
    name: string;
    width: number;
    height: number;
    seed: number;
  },
): Promise<UploadPayload> {
  const base64 = await page.evaluate(async ({ width, height, seed }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context is unavailable");
    }

    context.fillStyle = "#f4f0e8";
    context.fillRect(0, 0, width, height);

    const block = Math.max(16, Math.floor(Math.min(width, height) / 18));

    for (let y = 0; y < height; y += block) {
      for (let x = 0; x < width; x += block) {
        const hue = (seed * 41 + x * 7 + y * 11) % 360;
        const lightness = 32 + ((x + y + seed * 13) % 36);
        context.fillStyle = `hsl(${hue}deg 64% ${lightness}%)`;
        context.fillRect(x, y, block, block);
      }
    }

    context.globalAlpha = 0.28;

    for (let index = 0; index < 48; index += 1) {
      const radius = 18 + ((index * 5 + seed) % 42);
      const x = (index * 137 + seed * 29) % width;
      const y = (index * 97 + seed * 17) % height;
      const hue = (seed * 59 + index * 23) % 360;

      context.fillStyle = `hsl(${hue}deg 78% 52%)`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }

    context.globalAlpha = 1;

    return canvas.toDataURL("image/jpeg", 0.92).split(",")[1] ?? "";
  }, options);

  return {
    name: options.name,
    mimeType: "image/jpeg",
    buffer: Buffer.from(base64, "base64"),
  };
}

async function uploadPhotos(
  page: Page,
  photos: UploadPayload[],
  expectedReadyPhotoCount: number,
): Promise<void> {
  const fileInput = page.locator(".dropzone input[type='file']").first();
  const readyPhotoImages = page.locator(LISTING_PHOTO_SELECTOR);
  let completedUploads = await readyPhotoImages.count();

  for (const photo of photos) {
    await fileInput.setInputFiles(photo);
    completedUploads += 1;
    await expect(readyPhotoImages).toHaveCount(completedUploads, {
      timeout: 30_000,
    });
  }

  await expect(readyPhotoImages).toHaveCount(expectedReadyPhotoCount, {
    timeout: 30_000,
  });
  await expect(page.locator("[aria-label='Uploading photo']")).toHaveCount(0, {
    timeout: 30_000,
  });
}

async function fillDetailsStep(page: Page): Promise<void> {
  await page.getByRole("combobox", { name: /brand/i }).fill("Nike");
  await page.getByLabel(/^Title/).fill("Nike vintage tee");
  await page.getByRole("button", { name: "Blue" }).click();
  await page.getByRole("button", { name: "Tops" }).click();
  // Real seeded category display name is "T Shirts" (no hyphen) — the
  // component-test fixtures use "T-Shirts", but that's mock data; this is
  // what the real DB seed (packages/db/src/seed.ts) actually produces.
  await page.getByRole("button", { name: "T Shirts" }).click();
  // Non-exact "M" substring-matches many unrelated buttons ("Multi",
  // "Bottoms", "Swimwear", quick-add chips, etc.) — exact match is required.
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page
    .getByLabel(/^Description/)
    .fill("Soft cotton vintage tee with a relaxed fit and one tiny mark near the hem.");
}

async function fillConditionStep(page: Page): Promise<void> {
  await page.getByText("Good", { exact: true }).click();
  // Non-exact "Length" also substring-matches "Sleeve length" and the
  // measurement diagram's alt/label text.
  await page.getByRole("spinbutton", { name: "Length", exact: true }).fill("72");
  await page
    .getByLabel("Condition notes Optional")
    .fill("One tiny mark near the hem that is visible in the photos.");
}

async function fillPriceStep(page: Page): Promise<void> {
  await page.getByLabel(/Asking price/i).fill("85");
}

async function fillShippingStep(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Buyer pays postage/i }).click();
  await page
    .getByRole("button", { name: /Small \(<500g\) - \$8\.55/i })
    .click();
}
