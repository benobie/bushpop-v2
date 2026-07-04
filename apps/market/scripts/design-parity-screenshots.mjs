#!/usr/bin/env node
/**
 * Design-parity screenshot tool (U0). Manual/local only — NOT part of the
 * CI-gated e2e suite, because the comparison target lives outside this repo
 * (~/projects/Bushpop/design/home, a non-git workspace per the master
 * CLAUDE.md) and simply isn't present in a CI checkout. Run this locally
 * whenever `packages/ui` or `packages/config/tailwind` changes, with both
 * servers up:
 *
 *   cd ~/projects/Bushpop/design/home && python3 -m http.server 8899 &
 *   pnpm --filter @bushpop/market dev &
 *   node apps/market/scripts/design-parity-screenshots.mjs
 *
 * Writes PNGs to apps/market/.design-parity/ (gitignored).
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", ".design-parity");

const PROTOTYPE_BASE = "http://localhost:8899";
const APP_BASE = process.env.APP_BASE_URL ?? "http://localhost:3002";

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 390, height: 844 },
};

const TARGETS = [
  { name: "prototype-home-v3", url: `${PROTOTYPE_BASE}/bushpop-home-v3.html` },
  { name: "prototype-button-lab", url: `${PROTOTYPE_BASE}/button-lab.html` },
  { name: "app-design-preview", url: `${APP_BASE}/design-preview` },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ viewport });
    // Block the prototype's Google Fonts @import — an external fetch that
    // hangs "load"/"networkidle" indefinitely in a sandboxed environment.
    await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    const page = await context.newPage();
    for (const target of TARGETS) {
      const file = path.join(OUT_DIR, `${target.name}-${viewportName}.png`);
      try {
        await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 15_000 });
        await page.waitForTimeout(500); // let card/nav hover CSS settle
        await page.screenshot({ path: file, fullPage: true });
        console.log(`✓ ${file}`);
      } catch (err) {
        console.error(`✗ ${target.url} (${viewportName}):`, err.message);
      }
    }
    await context.close();
  }

  await browser.close();
}

main();
