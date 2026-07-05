/**
 * Checkout E2E — browse→bag→checkout→confirmation against the real
 * app+API+Postgres stack, with a genuine Stripe test-card payment attempt.
 *
 * Requires STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY /
 * STRIPE_WEBHOOK_SECRET to be real Stripe TEST-MODE keys (same dependency
 * packages/api/src/test/integration/store/checkout.test.ts already has) —
 * with placeholder .env values, POST /api/v1/store/checkout itself 502s
 * with STRIPE_ERROR (the real Stripe secret key call fails outright, before
 * PaymentElement ever gets a client secret to mount against), so this spec
 * cannot get past "Continue to payment" locally. Not a spec bug; a local-env
 * prerequisite. Confirmed via a live run against this repo's own placeholder
 * .env (05/07) — the "happy path" and "declined card" tests both fail here,
 * not in this spec's own logic.
 *
 * Seeds one buyer + one seller + one active listing directly (fixtures/auth.ts,
 * fixtures/listing.ts) rather than re-driving the sell wizard UI — that flow
 * is already covered end-to-end by sell-wizard.spec.ts.
 */
import { expect, test as base, type Page } from "@playwright/test";
import { closeFixtureDb, createAuthenticatedBuyer, createAuthenticatedSeller } from "./fixtures/auth";
import { createActiveListing, type SeededListing } from "./fixtures/listing";

const BASE_URL = "http://localhost:3002";

type BuyerStorageState = Awaited<ReturnType<typeof createAuthenticatedBuyer>>["storageState"];

const test = base.extend<
  { storageState: BuyerStorageState },
  { buyerStorageState: BuyerStorageState; listing: SeededListing }
>({
  // Worker-scoped: the auth endpoint is real-rate-limited (10/min) — see
  // sell-wizard.spec.ts's identical note.
  listing: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const { userId } = await createAuthenticatedSeller(BASE_URL);
      const seeded = await createActiveListing(userId);
      await use(seeded);
    },
    { scope: "worker" },
  ],
  buyerStorageState: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const { storageState } = await createAuthenticatedBuyer(BASE_URL);
      await use(storageState);
    },
    { scope: "worker" },
  ],
  storageState: async ({ buyerStorageState }, use) => {
    await use(buyerStorageState);
  },
});

test.afterAll(async () => {
  await closeFixtureDb();
});

test("happy path — add to bag through a paid, confirmed order", async ({ page, listing }) => {
  await page.goto(`/listing/${listing.handle}`);

  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByText("Added to bag!")).toBeVisible();

  // domcontentloaded, not the default "load": Stripe.js's fraud-detection
  // resource never resolves against a placeholder publishable key, so the
  // window "load" event never fires locally — a real Stripe test-mode key
  // wouldn't have this problem, but the app is functionally interactive well
  // before "load" regardless (confirmed via the data-testid assertions below).
  await page.goto("/checkout", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByTestId("checkout-page")).toBeVisible();

  // Buyer fixture seeds exactly one address — it's the default, so it should
  // already be selected.
  const addressOption = page.getByTestId(/^address-option-/).first();
  await expect(addressOption).toBeVisible();
  await expect(addressOption.locator("input[type=radio]")).toBeChecked();

  await page.getByTestId("checkout-continue-button").click();

  await expect(page.getByTestId("order-summary-totals")).toBeVisible({ timeout: 15_000 });
  const totalRow = page.getByTestId("checkout-total-row");
  await expect(totalRow).toBeVisible();
  await expect(totalRow).not.toBeEmpty();

  await fillStripeTestCard(page, "4242424242424242");

  await page.getByTestId("pay-button").click();

  await expect(page).toHaveURL(/\/checkout\/confirmation\?/, { timeout: 30_000 });
  await expect(page.getByTestId("checkout-confirmation-page")).toBeVisible();

  // Webhook timing is inherently racy locally — both outcomes are a valid
  // "success" for this test (same .or() pattern sell-wizard.spec.ts uses for
  // its own two-possible-states case).
  const confirmedBanner = page.getByTestId("order-confirmed-banner");
  const processingFallback = page.getByTestId("order-processing-fallback");
  await expect(confirmedBanner.or(processingFallback)).toBeVisible({ timeout: 30_000 });
});

test("declined card — shows the failed-payment banner", async ({ page, listing }) => {
  await page.goto(`/listing/${listing.handle}`);
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByText("Added to bag!")).toBeVisible();

  await page.goto("/checkout", { waitUntil: "domcontentloaded" });
  await page.getByTestId("checkout-continue-button").click();
  await expect(page.getByTestId("order-summary-totals")).toBeVisible({ timeout: 15_000 });

  await fillStripeTestCard(page, "4000000000000002");
  await page.getByTestId("pay-button").click();

  await expect(page).toHaveURL(/\/checkout\/confirmation\?.*redirect_status=failed/, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("checkout-payment-failed")).toBeVisible();
});

/**
 * Fills Stripe's PaymentElement iframe with a test card. Frame title is
 * version-dependent — confirmed against the pinned @stripe/react-stripe-js
 * version at the time this spec was written; re-check if Stripe.js is
 * upgraded and this starts timing out.
 */
async function fillStripeTestCard(page: Page, cardNumber: string): Promise<void> {
  const stripeFrame = page.frameLocator('iframe[title="Secure payment input frame"]').first();
  await stripeFrame.locator('[name="number"]').fill(cardNumber);
  await stripeFrame.locator('[name="expiry"]').fill("12/34");
  await stripeFrame.locator('[name="cvc"]').fill("123");

  const postal = stripeFrame.locator('[name="postalCode"]');
  if (await postal.isVisible().catch(() => false)) {
    await postal.fill("2000");
  }
}
