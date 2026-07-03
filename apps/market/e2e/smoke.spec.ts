import { expect, test } from "@playwright/test";

test("home page responds", async ({ page }) => {
  const response = await page.goto("/");

  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(400);
});
