#!/usr/bin/env node
/**
 * Core Web Vitals budget check (ROADMAP 3.2).
 *
 * Runs Lighthouse (mobile preset, Lantern-simulated throttling) against the
 * market app's SEO-critical pages and checks the lab metrics against a
 * two-tier budget declared in `cwv-budgets.json`:
 *
 *   - `target`  — where we want to be (Google's "good" thresholds). Breaching
 *                 this WARNS. Several pages breach it today; that is a known,
 *                 content-volume-driven gap (see docs/cwv-budget.md), not a
 *                 regression, and a permanently-red check would just be noise.
 *   - `ceiling` — a regression guard set above today's measured median.
 *                 Breaching this FAILS (exit 1). This is the bit that has teeth.
 *
 * Why Lighthouse and not a Playwright PerformanceObserver harness: every prior
 * CWV number recorded for this app (batch 40 / 42 / 43, quoted in
 * .claude/CLAUDE.md) came from Lighthouse mobile. Reusing it keeps the numbers
 * comparable across sessions instead of starting a fresh, incomparable series.
 *
 * Usage:
 *   node apps/market/scripts/cwv-budget.mjs                      # staging
 *   node apps/market/scripts/cwv-budget.mjs --base http://localhost:3002
 *   node apps/market/scripts/cwv-budget.mjs --trials 1           # quick look
 *   node apps/market/scripts/cwv-budget.mjs --json out.json      # machine output
 *
 * Read-only: issues GETs only. Safe to point at staging.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUDGETS = JSON.parse(readFileSync(path.join(__dirname, "..", "cwv-budgets.json"), "utf8"));

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = (arg("--base", BUDGETS.defaultBase)).replace(/\/$/, "");
const TRIALS = Number(arg("--trials", "3"));
const JSON_OUT = arg("--json", null);

/** Lighthouse is nondeterministic run-to-run; the median of N trials is the
 *  number worth gating on. Mean would let one cold-cache outlier move it. */
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * `--no-sandbox` is required: headless Chrome throws CHROME_INTERSTITIAL_ERROR
 * against market.bushpop.xyz without it in this environment.
 */
function runLighthouse(url) {
  const dir = mkdtempSync(path.join(tmpdir(), "cwv-"));
  const out = path.join(dir, "r.json");
  try {
    execFileSync(
      "npx",
      [
        "-y",
        "lighthouse",
        url,
        "--quiet",
        "--output=json",
        `--output-path=${out}`,
        "--only-categories=performance",
        "--form-factor=mobile",
        "--screenEmulation.mobile",
        "--chrome-flags=--headless=new --no-sandbox --ignore-certificate-errors",
      ],
      { stdio: ["ignore", "ignore", "pipe"], timeout: 180_000 },
    );
    const r = JSON.parse(readFileSync(out, "utf8"));
    const a = r.audits;
    return {
      lcp: a["largest-contentful-paint"].numericValue,
      cls: a["cumulative-layout-shift"].numericValue,
      tbt: a["total-blocking-time"].numericValue,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const METRICS = [
  { key: "lcp", label: "LCP", unit: "ms", fmt: (v) => `${(v / 1000).toFixed(2)}s` },
  { key: "cls", label: "CLS", unit: "", fmt: (v) => v.toFixed(3) },
  { key: "tbt", label: "TBT", unit: "ms", fmt: (v) => `${Math.round(v)}ms` },
];

/**
 * A 404 page renders fast and would sail under every ceiling — a silently
 * green run measuring nothing. The PDP path in particular is a seed-fixture
 * handle that a reseed can invalidate, so assert every page is really there
 * before spending ~40s/trial measuring it.
 */
async function preflight(urls) {
  const bad = [];
  for (const url of urls) {
    const status = await fetch(url, { redirect: "follow" })
      .then((r) => r.status)
      .catch(() => 0);
    if (status !== 200) bad.push(`${url} -> ${status || "unreachable"}`);
  }
  if (bad.length) {
    console.error("Pre-flight failed; refusing to measure pages that aren't serving 200:");
    for (const b of bad) console.error(`  ✗ ${b}`);
    console.error("\nIf a seeded listing handle changed, update cwv-budgets.json.");
    process.exit(1);
  }
}

async function main() {
  console.log(`CWV budget check — base=${BASE}, trials=${TRIALS}\n`);
  await preflight(BUDGETS.pages.map((p) => `${BASE}${p.path}`));

  const results = [];
  let failed = false;
  let warned = false;

  for (const page of BUDGETS.pages) {
    const url = `${BASE}${page.path}`;
    const samples = [];
    for (let i = 0; i < TRIALS; i++) {
      try {
        samples.push(runLighthouse(url));
      } catch (err) {
        console.error(`  ✗ Lighthouse failed on ${url}: ${err.message.split("\n")[0]}`);
      }
    }
    if (samples.length === 0) {
      console.error(`✗ ${page.name} (${page.path}) — no successful Lighthouse runs`);
      failed = true;
      continue;
    }

    const med = Object.fromEntries(
      METRICS.map((m) => [m.key, median(samples.map((s) => s[m.key]))]),
    );
    console.log(`${page.name}  ${page.path}  (${samples.length}/${TRIALS} trials)`);

    for (const m of METRICS) {
      const value = med[m.key];
      const target = page.target[m.key];
      const ceiling = page.ceiling[m.key];
      let status = "pass";
      if (value > ceiling) {
        status = "FAIL";
        failed = true;
      } else if (value > target) {
        status = "warn";
        warned = true;
      }
      const badge = status === "FAIL" ? "✗ FAIL" : status === "warn" ? "! warn" : "✓ pass";
      console.log(
        `  ${badge}  ${m.label.padEnd(3)} ${m.fmt(value).padStart(8)}` +
          `   target ${m.fmt(target)}  ceiling ${m.fmt(ceiling)}`,
      );
    }
    console.log("");
    results.push({ page: page.name, path: page.path, median: med, trials: samples.length });
  }

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, trials: TRIALS, results }, null, 2));
    console.log(`wrote ${JSON_OUT}`);
  }

  if (failed) {
    console.error("CWV: at least one metric breached its regression ceiling.");
    process.exit(1);
  }
  console.log(
    warned
      ? "CWV: all metrics within regression ceilings; some still short of target (expected)."
      : "CWV: all metrics within target.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
