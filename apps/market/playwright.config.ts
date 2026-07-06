import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
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
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
