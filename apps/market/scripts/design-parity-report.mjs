#!/usr/bin/env node
/**
 * Design-parity report (ROADMAP 3.2).
 *
 * Screenshots the live market surfaces against the approved prototypes in
 * ~/projects/Bushpop/design/home/ and emits a markdown report plus paired
 * JPEGs into docs/design-parity/.
 *
 * This is a REPORTING artefact, not a blocking gate: the prototypes live
 * outside this repo (a non-git workspace per the master CLAUDE.md) and are
 * simply absent from a CI checkout, so this can never run in CI. It is also
 * deliberately not a pixel-diff — the prototypes are static fixtures with
 * hard-coded products, while the app renders real listings, so a pixel diff
 * would be 100% "different" and tell you nothing. A human reads the pairs.
 *
 * Sibling script: design-parity-screenshots.mjs shoots the LOCAL app's
 * /design-preview route (component-level parity, needs a dev server). This
 * one shoots DEPLOYED pages (page-level parity, needs nothing but network).
 *
 * Usage:
 *   node apps/market/scripts/design-parity-report.mjs
 *   node apps/market/scripts/design-parity-report.mjs --base http://localhost:3002
 *
 * Read-only against the app: GETs only, safe to point at staging.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "docs", "design-parity");
const PROTOTYPE_DIR = path.join(homedir(), "projects", "Bushpop", "design", "home");

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const APP_BASE = arg("--base", "https://market.bushpop.xyz").replace(/\/$/, "");
const PROTO_PORT = 8899;

/** Keep the committed artefact small — the brief caps this at 5MB total. */
const JPEG_QUALITY = 60;
const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 390, height: 844 },
};

const PAIRS = [
  { name: "home", prototype: "bushpop-home-v3.html", appPath: "/" },
  { name: "shop", prototype: "shop.html", appPath: "/shop" },
  { name: "pdp", prototype: "product.html", appPath: "/listing/linen-shirt-k06tm2" },
];

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

function servePrototypes() {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, "");
    const file = path.join(PROTOTYPE_DIR, rel);
    if (!file.startsWith(PROTOTYPE_DIR) || !existsSync(file)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PROTO_PORT, () => resolve(server)));
}

async function shoot(page, url, file) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  // Let lazy images, fonts and hover/scroll-triggered CSS settle. A fresh goto
  // leaves the page scrolled to the top, which is what we want — the nav is
  // borderless-until-scroll.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: file, fullPage: true, type: "jpeg", quality: JPEG_QUALITY });
}

/**
 * Clear only what THIS script generates (the JPEGs and README.md). An earlier
 * version did `rm -rf OUT_DIR`, which silently deleted the hand-written
 * FINDINGS.md sitting alongside them. Never blow away a directory you share
 * with a human author.
 */
async function clearGenerated() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const f of await readdir(OUT_DIR)) {
    if (f.endsWith(".jpg") || f === "README.md") await rm(path.join(OUT_DIR, f), { force: true });
  }
}

async function main() {
  await clearGenerated();

  if (!existsSync(PROTOTYPE_DIR)) {
    console.error(`Prototype dir not found: ${PROTOTYPE_DIR}`);
    process.exit(1);
  }

  const server = await servePrototypes();
  const browser = await chromium.launch();
  const captured = [];

  try {
    for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext({ viewport });
      // The prototype @imports Google Fonts; that external fetch hangs in a
      // sandboxed environment and would stall every prototype capture.
      await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      const page = await context.newPage();

      for (const pair of PAIRS) {
        for (const [side, url] of [
          ["prototype", `http://127.0.0.1:${PROTO_PORT}/${pair.prototype}`],
          ["app", `${APP_BASE}${pair.appPath}`],
        ]) {
          const rel = `${pair.name}-${side}-${vpName}.jpg`;
          try {
            await shoot(page, url, path.join(OUT_DIR, rel));
            captured.push(rel);
            console.log(`✓ ${rel}`);
          } catch (err) {
            console.error(`✗ ${rel}: ${err.message.split("\n")[0]}`);
          }
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  let total = 0;
  for (const f of await readdir(OUT_DIR)) total += (await stat(path.join(OUT_DIR, f))).size;
  const mb = (total / 1024 / 1024).toFixed(2);
  console.log(`\n${captured.length} images, ${mb} MB total`);
  if (total > 5 * 1024 * 1024) {
    console.error(`Over the 5MB artefact cap (${mb} MB) — lower JPEG_QUALITY or drop a viewport.`);
    process.exit(1);
  }

  const rows = PAIRS.map((p) => {
    const cells = ["desktop", "mobile"]
      .flatMap((v) => [`${p.name}-prototype-${v}.jpg`, `${p.name}-app-${v}.jpg`])
      .map((f) => (captured.includes(f) ? `[${f.split("-").slice(1).join(" ")}](./${f})` : "—"));
    return `| \`${p.appPath}\` | ${p.prototype} | ${cells.join(" · ")} |`;
  }).join("\n");

  await writeFile(
    path.join(OUT_DIR, "README.md"),
    `# Design-parity screenshots

Generated by \`apps/market/scripts/design-parity-report.mjs\` against
\`${APP_BASE}\` and the approved prototypes in \`~/projects/Bushpop/design/home/\`.

Regenerate with:

\`\`\`bash
node apps/market/scripts/design-parity-report.mjs
\`\`\`

This is a **reporting artefact, not a gate**. It is not a pixel diff: the
prototypes are static fixtures with hard-coded products while the app renders
real listings, so an automated diff would report 100% difference and tell you
nothing. Read the pairs side by side.

| Route | Prototype | Captures |
| --- | --- | --- |
${rows}

Findings from the current capture live in [\`FINDINGS.md\`](./FINDINGS.md).
`,
    "utf8",
  );
  console.log(`wrote ${path.join(OUT_DIR, "README.md")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
