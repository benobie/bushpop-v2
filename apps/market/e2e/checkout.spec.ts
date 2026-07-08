/**
 * Checkout E2E — browse→bag→checkout→a REAL Stripe test-card payment→
 * confirmation, against the real app+API+Postgres stack.
 *
 * Requires STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to be real
 * Stripe TEST-MODE keys (with placeholders, POST /api/v1/store/checkout
 * 502s with STRIPE_ERROR before PaymentElement ever mounts — confirmed
 * while writing this spec, before real keys were wired in).
 *
 * Webhook caveat: this sandbox's outbound network reaches api.stripe.com
 * over plain HTTPS fine, but the websocket connection Stripe CLI's
 * `stripe listen` needs to relay webhooks to localhost hangs indefinitely
 * (verified directly — not a sandbox permission, `dangerouslyDisableSandbox`
 * made no difference). So after the real PaymentIntent succeeds, this spec
 * fetches that REAL PaymentIntent from Stripe's REST API and delivers it to
 * our own webhook endpoint itself, HMAC-signed the same way
 * stripe.webhooks.constructEvent verifies (crypto.createHmac + the shared
 * local STRIPE_WEBHOOK_SECRET). That exercises the real
 * handlePaymentIntentSucceeded() order-creation path with real payment
 * data — only Stripe's own network hop for delivering the webhook is
 * short-circuited, not any application logic.
 *
 * Seeds one buyer + one seller + one active listing directly (fixtures/auth.ts,
 * fixtures/listing.ts) rather than re-driving the sell wizard UI — that flow
 * is already covered end-to-end by sell-wizard.spec.ts.
 */
import { createHmac } from "node:crypto";
import { expect, test as base, type Page } from "@playwright/test";
import { calcBuyerProtectionFeeCents, FLAT_RATE_SHIPPING_CENTS } from "@bushpop/config";
import { closeFixtureDb, createAuthenticatedBuyer, createAuthenticatedSeller } from "./fixtures/auth";
import { createActiveListing, type SeededListing } from "./fixtures/listing";

const BASE_URL = "http://localhost:3002";
// Webhook delivery goes straight to the API, not through the Next.js app's
// proxy — real Stripe webhooks hit the API directly in every deployed
// environment, and market's proxy.ts CSRF guard (FM-17) 403s a same-shape
// POST that's missing the browser-only x-requested-with header anyway.
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3333";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

type BuyerStorageState = Awaited<ReturnType<typeof createAuthenticatedBuyer>>["storageState"];

const test = base.extend<
  { storageState: BuyerStorageState; listing: SeededListing },
  { buyerStorageState: BuyerStorageState }
>({
  // Test-scoped (NOT worker-scoped): the happy-path test performs a real
  // purchase, which correctly flips the listing to `sold` (verified in
  // store/checkout-flow.test.ts's own assertions) — sharing one listing
  // across both tests in this file meant whichever test ran second was
  // racing that transition and could get "Cannot add listing to cart:
  // listing status is 'sold'" depending on how much time had elapsed
  // since the first test's webhook delivery. Each test gets its own
  // seller + listing instead; only the buyer identity below stays
  // worker-scoped (auth sign-up is real-rate-limited at 10/min, and a
  // shared buyer isn't a resource either test consumes).
  listing: async (
    // eslint-disable-next-line no-empty-pattern
    {},
    use,
  ) => {
    const { userId } = await createAuthenticatedSeller(BASE_URL);
    const seeded = await createActiveListing(userId);
    await use(seeded);
  },
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
  // Playwright's default per-test timeout is 30s (no top-level `timeout`
  // in playwright.config.ts — only webServer's own boot timeout is set
  // there). This test does two real Stripe round trips (confirmPayment,
  // then poll-for-succeeded + deliver webhook) plus OrderPoller's own
  // ~30.5s poll budget, so it legitimately needs more than the default —
  // 60s comfortably covers all of that plus CI jitter. (The 90s/85s figures
  // that were here before were chasing a mistaken timing theory — see the
  // root-cause note on the "It's yours." assertion below.)
  test.setTimeout(60_000);

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

  const checkoutResponsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/v1/store/checkout") && res.request().method() === "POST",
  );
  await page.getByTestId("checkout-continue-button").click();
  const checkoutResponse = await checkoutResponsePromise;
  const { clientSecret } = (await checkoutResponse.json()) as { clientSecret: string };
  const paymentIntentId = clientSecret.split("_secret_")[0]!;

  await expect(page.getByTestId("order-summary-totals")).toBeVisible({ timeout: 15_000 });

  // Fee correctness (§7.5) — the UI must render engine-computed values, never
  // re-derive them. Compute the expected total independently from the same
  // @bushpop/config functions the checkout API itself uses, rather than a
  // hard-coded number, so this stays correct if the fee schedule changes.
  const shippingCents = FLAT_RATE_SHIPPING_CENTS[listing.shippingClass ?? "m"]!;
  const buyerProtectionFeeCents = calcBuyerProtectionFeeCents(listing.priceCents);
  const totalCents = listing.priceCents + shippingCents + buyerProtectionFeeCents;
  const fmt = (cents: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

  const totalRow = page.getByTestId("checkout-total-row");
  const totalsBlock = page.getByTestId("order-summary-totals");
  await expect(totalRow).toContainText(fmt(totalCents));
  await expect(totalsBlock.getByText("Buyer Protection")).toBeVisible();
  await expect(totalsBlock.getByText(fmt(buyerProtectionFeeCents))).toBeVisible();
  // The label must never say "insurance" (trust-claims ledger).
  await expect(page.getByText(/insurance/i)).toHaveCount(0);

  await fillStripeTestCard(page, "4242424242424242");
  await page.getByTestId("pay-button").click();

  await expect(page).toHaveURL(/\/checkout\/confirmation\?/, { timeout: 30_000 });
  await expect(page.getByTestId("checkout-confirmation-page")).toBeVisible();

  const paymentIntent = await waitForPaymentIntentSucceeded(paymentIntentId);
  await deliverWebhook(paymentIntent);

  // "It's yours." — the real order, created by the real webhook handler
  // above, rendered with the real enriched item title/photo. OrderPoller
  // (order-poller.tsx) starts its own 2s-interval/15-attempt (~30.5s) poll
  // budget the moment the confirmation page loads, so 40s covers a full
  // worst-case poll cycle plus CI jitter.
  //
  // Root cause of the prior "flake" (batch 45): this was never a timing
  // issue. order-poller.tsx renders the heading as `It&rsquo;s yours.`
  // (curly apostrophe U+2019, matching the rest of that component's copy —
  // "it&rsquo;s delivered", "doesn&rsquo;t arrive", etc.), but this locator
  // searched for a straight apostrophe (U+0027). Playwright's accessible-name
  // matching does not normalize punctuation, so the two can never match —
  // confirmed from a CI trace: the order was fetched and "It's yours."
  // (curly quote) was visibly rendered and stable on screen from ~2s after
  // the assertion started clear through to the end of the run, while this
  // assertion still reported "element not found" the entire time. No amount
  // of timeout widening could have fixed a permanent string mismatch, which
  // is exactly what batch 44's five escalating timeout bumps (30s→90s)
  // ran into. Matching via regex here so either apostrophe form passes.
  await expect(page.getByRole("heading", { name: /It.s yours\./ })).toBeVisible({
    timeout: 40_000,
  });
  await expect(page.getByText(listing.title, { exact: false })).toBeVisible();
});

async function waitForPaymentIntentSucceeded(
  id: string,
  attempts = 10,
): Promise<Record<string, unknown>> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${id}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${STRIPE_SECRET_KEY}:`).toString("base64")}`,
      },
    });
    const pi = (await res.json()) as { status: string };
    if (pi.status === "succeeded") return pi as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`PaymentIntent ${id} did not reach 'succeeded' in time`);
}

async function deliverWebhook(paymentIntent: Record<string, unknown>): Promise<void> {
  const event = {
    id: `evt_e2e_${Date.now()}`,
    object: "event",
    type: "payment_intent.succeeded",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    data: { object: paymentIntent },
  };
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  const res = await fetch(`${API_BASE_URL}/api/v1/webhooks/stripe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    },
    body: payload,
  });

  if (!res.ok) {
    throw new Error(`Webhook delivery failed: ${res.status} ${await res.text()}`);
  }
}

test("declined card — shows the failed-payment banner", async ({ page, listing }) => {
  await page.goto(`/listing/${listing.handle}`);
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByText("Added to bag!")).toBeVisible();

  await page.goto("/checkout", { waitUntil: "domcontentloaded" });
  await page.getByTestId("checkout-continue-button").click();
  await expect(page.getByTestId("order-summary-totals")).toBeVisible({ timeout: 15_000 });

  await fillStripeTestCard(page, "4000000000000002");
  await page.getByTestId("pay-button").click();

  // A same-request decline resolves confirmPayment() synchronously with
  // result.error — Stripe.js never navigates to return_url for this case
  // (only a definitive success, or certain async next-action flows,
  // trigger the redirect). PaymentSection renders the error inline and
  // stays on /checkout — confirmed via CI screenshot showing exactly this
  // (Card declined, Banner visible, still on /checkout).
  await expect(page).toHaveURL(/\/checkout$/, { timeout: 30_000 });
  await expect(page.getByTestId("payment-error")).toBeVisible();
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

  // Country defaults to United States (Stripe.js has no billing-country
  // context to infer from in this harness), so a bare AU postcode like
  // "2000" fails the element's US ZIP format check ("Your ZIP is invalid.")
  // and silently blocks confirmPayment() client-side before any network
  // call is made. Select Australia first so the postcode validates against
  // the right format — confirmed via CI trace screenshots showing this
  // exact validation error blocking both the happy-path and declined-card
  // tests identically.
  const country = stripeFrame.locator('[name="country"]');
  if (await country.isVisible().catch(() => false)) {
    await country.selectOption("AU");
  }

  const postal = stripeFrame.locator('[name="postalCode"]');
  if (await postal.isVisible().catch(() => false)) {
    await postal.fill("2000");
  }
}
