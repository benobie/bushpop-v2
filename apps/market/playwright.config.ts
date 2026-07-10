import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  // Deliberately 0, including in CI. This suite's whole job is to be a
  // stability signal for the checkout money path, and `retries` would convert
  // a real flake into a silent green. The two historical "flakes" here were
  // both permanent bugs that retries would have hidden forever: a
  // curly-vs-straight apostrophe locator mismatch, and two tests sharing one
  // worker-scoped listing that the first test legitimately sells (both fixed
  // in PR #100). If this suite goes red, it means something is actually
  // broken — fix that, don't add a retry.
  retries: 0,
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
  use: {
    baseURL: "http://localhost:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Stripe.js gates confirmPayment() behind an invisible hCaptcha risk
    // check on PaymentElement mount. Playwright's default UA literally says
    // "Playwright ... CI/1" and sets navigator.webdriver — hCaptcha reads
    // both as automation and never resolves the challenge, so
    // confirmPayment() hangs forever (confirmed: zero requests to Stripe's
    // confirm API ever appear in a trace of the hung state). Both flags
    // below are the standard workaround for testing Stripe Elements under
    // headless automation — see checkout.spec.ts's header comment.
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    launchOptions: {
      args: ["--disable-blink-features=AutomationControlled"],
    },
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3002",
    // Locally, attach to whatever dev server is already up (fast iteration).
    // In CI, always boot our own: attaching to a stray server from an earlier
    // step would run the suite against unknown code and could report a
    // meaningless green.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
