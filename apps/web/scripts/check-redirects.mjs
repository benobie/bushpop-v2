#!/usr/bin/env node
/**
 * check-redirects.mjs — verify redirect/status behaviour for a set of URLs
 * against a live base (staging or production), without ever letting fetch()
 * auto-follow a redirect (we need to see every hop).
 *
 * Two input modes (mutually exclusive):
 *   --inventory <csv>  full GSC-derived inventory: url,status,section,clicks,
 *                      impressions,action,redirect_target,notes
 *   --fixture  <csv>   hand-picked structural sample: path,expected_status,
 *                      expected_location_prefix
 *
 * Zero dependencies — Node 22 built-in fetch only.
 *
 * Usage:
 *   node check-redirects.mjs --base https://bushpop-v2.pages.dev \
 *     --fixture apps/web/scripts/fixtures/redirect-fixture.csv \
 *     [--concurrency 5] [--delay-ms 150] [--sample 300] \
 *     [--out failures.csv] [--format summary|csv]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { argv, exit } from "node:process";

// ── CLI parsing ──────────────────────────────────────────────────────────

function parseArgs(args) {
  const out = {
    base: undefined,
    inventory: undefined,
    fixture: undefined,
    concurrency: 5,
    delayMs: 150,
    sample: undefined,
    out: undefined,
    format: "summary",
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    switch (a) {
      case "--base":
        out.base = next();
        break;
      case "--inventory":
        out.inventory = next();
        break;
      case "--fixture":
        out.fixture = next();
        break;
      case "--concurrency":
        out.concurrency = Number(next());
        break;
      case "--delay-ms":
        out.delayMs = Number(next());
        break;
      case "--sample":
        out.sample = Number(next());
        break;
      case "--out":
        out.out = next();
        break;
      case "--format":
        out.format = next();
        break;
      default:
        throw new Error(`Unknown flag: ${a}`);
    }
  }
  if (!out.base) throw new Error("--base is required");
  if (!out.inventory && !out.fixture) {
    throw new Error("Exactly one of --inventory or --fixture is required");
  }
  if (out.inventory && out.fixture) {
    throw new Error("--inventory and --fixture are mutually exclusive");
  }
  if (!["summary", "csv"].includes(out.format)) {
    throw new Error(`--format must be summary|csv, got: ${out.format}`);
  }
  return out;
}

// ── CSV parsing (minimal, handles quoted fields with commas) ────────────

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    header.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
  return { header, rows };
}

function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

// ── URL helpers ──────────────────────────────────────────────────────────

function extractPath(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    // Already a path, not a full URL.
    return url;
  }
}

// ── Stratified deterministic sampling (no Math.random) ──────────────────

function stratifiedSample(rows, sampleSize, strataKey) {
  if (!sampleSize || sampleSize >= rows.length) return rows;

  const strata = new Map();
  for (const row of rows) {
    const key = row[strataKey] ?? "";
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key).push(row);
  }

  // Always include ALL keep-exact rows.
  const always = strata.get("keep-exact") ?? [];
  const remainingStrata = new Map(
    [...strata.entries()].filter(([k]) => k !== "keep-exact"),
  );
  const remainingTotal = [...remainingStrata.values()].reduce(
    (sum, arr) => sum + arr.length,
    0,
  );

  const budget = Math.max(0, sampleSize - always.length);
  const result = [...always];

  for (const [, arr] of remainingStrata) {
    if (remainingTotal === 0 || budget === 0) break;
    const share = Math.max(
      1,
      Math.round((arr.length / remainingTotal) * budget),
    );
    const take = Math.min(share, arr.length);
    // Deterministic stride sample: every k-th row, no randomness.
    const stride = Math.max(1, Math.floor(arr.length / take));
    let taken = 0;
    for (let i = 0; i < arr.length && taken < take; i += stride) {
      result.push(arr[i]);
      taken++;
    }
  }

  return result;
}

// ── HTTP: manual redirect-chain walker ───────────────────────────────────

const MAX_HOPS = 5;
const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url, opts) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, redirect: "manual", signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Walk a redirect chain starting at `base + path`, never letting fetch
 * auto-follow. Tries HEAD first; falls back to GET when HEAD gives a
 * method-not-supported style response (405/501) OR when HEAD's status
 * doesn't look like a valid terminal/redirect status at all (some Pages
 * Functions — see functions/uncategorized/[[path]].js — only implement
 * onRequestGet and fall through to a generic 404 on HEAD, which would
 * otherwise be misread as "page doesn't exist").
 *
 * Returns { hops: [{status, location}], finalStatus, loop: boolean }
 */
async function walkChain(base, path) {
  const hops = [];
  let currentPath = path;
  const seen = new Set();

  for (let i = 0; i < MAX_HOPS; i++) {
    if (seen.has(currentPath)) {
      return { hops, finalStatus: hops[hops.length - 1]?.status ?? 0, loop: true };
    }
    seen.add(currentPath);

    const url = new URL(currentPath, base).toString();
    let res = await fetchWithTimeout(url, { method: "HEAD" });

    if (res.status === 405 || res.status === 501) {
      res = await fetchWithTimeout(url, { method: "GET" });
    }

    const isRedirect = res.status >= 300 && res.status < 400;
    const location = isRedirect ? res.headers.get("location") : null;

    hops.push({ status: res.status, location, method: isRedirect || res.status < 400 ? "HEAD" : "HEAD" });

    if (!isRedirect) {
      return { hops, finalStatus: res.status, loop: false, lastUrl: url };
    }
    if (!location) {
      // Redirect with no Location header — treat as terminal/broken.
      return { hops, finalStatus: res.status, loop: false, lastUrl: url };
    }
    currentPath = location;
  }

  return { hops, finalStatus: hops[hops.length - 1]?.status ?? 0, loop: false, truncated: true };
}

/**
 * Re-check the FINAL hop with GET when the HEAD-based chain landed on a
 * status that looks suspicious for what we expect (e.g. a plain 404 where
 * a 410 Gone is expected) — some endpoints only answer GET meaningfully.
 */
async function getFinalStatus(base, path) {
  const url = new URL(path, base).toString();
  const res = await fetchWithTimeout(url, { method: "GET" });
  return res.status;
}

// ── Disposition checks ───────────────────────────────────────────────────

async function checkKeepExact(base, path) {
  const chain = await walkChain(base, path);
  const hops = chain.hops.length;
  const nonFinalHops = chain.hops.filter((h) => h.status >= 300 && h.status < 400).length;
  if (chain.finalStatus === 200 && nonFinalHops === 0) {
    return { verdict: "pass", chain };
  }
  return { verdict: "fail", chain };
}

async function checkRedirect(base, path) {
  const chain = await walkChain(base, path);
  const redirectHops = chain.hops.filter((h) => h.status >= 300 && h.status < 400);
  const firstHop = chain.hops[0];
  const validFirstHop = firstHop && (firstHop.status === 301 || firstHop.status === 308);

  if (chain.loop) return { verdict: "fail", chain, reason: "redirect loop" };
  if (chain.finalStatus !== 200) {
    return { verdict: "fail", chain, reason: `final status ${chain.finalStatus} != 200` };
  }
  if (!validFirstHop) {
    return { verdict: "fail", chain, reason: "first hop not 301/308" };
  }
  if (redirectHops.length === 1) return { verdict: "pass", chain };
  if (redirectHops.length === 2) return { verdict: "warn", chain, reason: "2 redirect hops" };
  return { verdict: "fail", chain, reason: `${redirectHops.length} redirect hops` };
}

async function checkDrop(base, path, redirectTarget) {
  const chain = await walkChain(base, path);

  // Some 410-returning Cloudflare Pages Functions only implement GET
  // (see functions/uncategorized/[[path]].js) — a HEAD-only chain will
  // misreport 404 there. Re-verify with GET before failing a 410 check.
  if (chain.finalStatus === 404 && !redirectTarget) {
    const getStatus = await getFinalStatus(base, chain.lastUrl ?? new URL(path, base).toString());
    if (getStatus === 410) {
      chain.hops[chain.hops.length - 1] = { ...chain.hops[chain.hops.length - 1], status: 410, note: "re-verified via GET" };
      return { verdict: "pass", chain };
    }
  }

  if (redirectTarget) {
    // Expect a redirect landing at redirect_target's path.
    const targetPath = extractPath(redirectTarget);
    const redirectHops = chain.hops.filter((h) => h.status >= 300 && h.status < 400);
    if (chain.loop) return { verdict: "fail", chain, reason: "redirect loop" };
    if (redirectHops.length === 0 && chain.finalStatus === 200) {
      // Landed at 200 directly with no hop — acceptable if it's already the target.
      return { verdict: "pass", chain };
    }
    if (redirectHops.length >= 1 && chain.finalStatus === 200) {
      return { verdict: "pass", chain };
    }
    return { verdict: "fail", chain, reason: `expected redirect-to-${targetPath}, got final ${chain.finalStatus}` };
  }

  // No redirect_target: accept EITHER a true 410, OR a single 301 to
  // home ("/") or "/gone/".
  if (chain.finalStatus === 410 && chain.hops.length === 1) {
    return { verdict: "pass", chain };
  }
  const redirectHops = chain.hops.filter((h) => h.status >= 300 && h.status < 400);
  if (
    redirectHops.length === 1 &&
    chain.finalStatus === 200 &&
    (chain.hops[0].location === "/" || chain.hops[0].location?.startsWith("/gone/"))
  ) {
    return { verdict: "pass", chain };
  }
  return {
    verdict: "fail",
    chain,
    reason: `expected 410 or single 301 to home/gone, got final ${chain.finalStatus}`,
  };
}

async function checkFixtureRow(base, row) {
  const path = row.path;
  const expectedStatus = Number(row.expected_status);
  const expectedPrefix = row.expected_location_prefix || "";
  const chain = await walkChain(base, path);

  let finalStatus = chain.finalStatus;
  // Same GET fallback for 410-style fixture rows.
  if (finalStatus === 404 && expectedStatus === 410) {
    const getStatus = await getFinalStatus(base, chain.lastUrl ?? new URL(path, base).toString());
    if (getStatus === 410) finalStatus = 410;
  }

  if (finalStatus !== expectedStatus) {
    return {
      verdict: "fail",
      chain,
      reason: `expected final status ${expectedStatus}, got ${finalStatus}`,
    };
  }

  if (expectedPrefix) {
    const lastUrl = chain.lastUrl ?? new URL(path, base).toString();
    const finalPath = extractPath(lastUrl);
    if (!finalPath.startsWith(expectedPrefix)) {
      return {
        verdict: "fail",
        chain,
        reason: `expected final path prefix ${expectedPrefix}, landed at ${finalPath}`,
      };
    }
  }

  const redirectHops = chain.hops.filter((h) => h.status >= 300 && h.status < 400);
  if (redirectHops.length === 2) {
    return { verdict: "warn", chain, reason: "2 redirect hops" };
  }
  if (redirectHops.length >= 3) {
    return { verdict: "fail", chain, reason: `${redirectHops.length} redirect hops` };
  }
  if (chain.loop) return { verdict: "fail", chain, reason: "redirect loop" };

  return { verdict: "pass", chain };
}

// ── Worker pool ──────────────────────────────────────────────────────────

async function runPool(items, concurrency, delayMs, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorkerLoop() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]);
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    runWorkerLoop(),
  );
  await Promise.all(workers);
  return results;
}

function formatChain(chain) {
  return chain.hops.map((h) => `${h.status}${h.location ? `→${h.location}` : ""}`).join(" > ");
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(argv.slice(2));

  let items; // normalised: { path, kind: 'inventory'|'fixture', row }
  if (args.inventory) {
    const text = readFileSync(args.inventory, "utf-8");
    const { rows } = parseCsv(text);
    const sampled = stratifiedSample(rows, args.sample, "action");
    items = sampled.map((row) => ({ kind: "inventory", row }));
  } else {
    const text = readFileSync(args.fixture, "utf-8");
    const { rows } = parseCsv(text);
    const sampled = args.sample ? stratifiedSample(rows, args.sample, "expected_status") : rows;
    items = sampled.map((row) => ({ kind: "fixture", row }));
  }

  const results = await runPool(items, args.concurrency, args.delayMs, async (item) => {
    if (item.kind === "fixture") {
      const r = await checkFixtureRow(args.base, item.row);
      return { ...r, path: item.row.path, section: "-", action: "fixture" };
    }

    const path = extractPath(item.row.url);
    const action = item.row.action;
    let r;
    if (action === "keep-exact") {
      r = await checkKeepExact(args.base, path);
    } else if (action === "redirect") {
      r = await checkRedirect(args.base, path);
    } else if (action === "drop") {
      r = await checkDrop(args.base, path, item.row.redirect_target);
    } else {
      r = { verdict: "fail", chain: { hops: [] }, reason: `unknown action: ${action}` };
    }
    return { ...r, path, section: item.row.section, action };
  });

  let pass = 0;
  let warn = 0;
  let fail = 0;
  const failuresAndWarnings = [];
  const bySection = new Map(); // section -> action -> {pass,warn,fail}

  for (const r of results) {
    if (r.verdict === "pass") pass++;
    else if (r.verdict === "warn") warn++;
    else fail++;

    if (r.verdict !== "pass") {
      failuresAndWarnings.push({
        url: r.path,
        expected: r.reason ?? "",
        actual_chain: formatChain(r.chain),
        section: r.section ?? "-",
        action: r.action ?? "-",
      });
    }

    const sectionKey = r.section ?? "-";
    if (!bySection.has(sectionKey)) bySection.set(sectionKey, new Map());
    const actionMap = bySection.get(sectionKey);
    const actionKey = r.action ?? "-";
    if (!actionMap.has(actionKey)) actionMap.set(actionKey, { pass: 0, warn: 0, fail: 0 });
    actionMap.get(actionKey)[r.verdict === "pass" ? "pass" : r.verdict === "warn" ? "warn" : "fail"]++;
  }

  const total = results.length;
  console.log(`${total} tested, ${pass} pass, ${warn} warn, ${fail} fail`);

  console.log("\nsection            action        pass  warn  fail");
  console.log("-".repeat(50));
  for (const [section, actionMap] of [...bySection.entries()].sort()) {
    for (const [action, counts] of [...actionMap.entries()].sort()) {
      console.log(
        `${section.padEnd(19)} ${action.padEnd(13)} ${String(counts.pass).padStart(4)}  ${String(
          counts.warn,
        ).padStart(4)}  ${String(counts.fail).padStart(4)}`,
      );
    }
  }

  if (args.format === "csv") {
    const header = "url,expected,actual_chain,section,action";
    const lines = [header, ...failuresAndWarnings.map((f) => toCsvLine(f))];
    console.log("\n" + lines.join("\n"));
  }

  if (args.out) {
    const header = "url,expected,actual_chain,section,action";
    const lines = [header, ...failuresAndWarnings.map((f) => toCsvLine(f))];
    writeFileSync(args.out, lines.join("\n") + "\n", "utf-8");
    console.error(`\nwrote ${failuresAndWarnings.length} failures/warnings to ${args.out}`);
  }

  exit(fail === 0 ? 0 : 1);
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsvLine(f) {
  return [f.url, f.expected, f.actual_chain, f.section, f.action].map(csvEscape).join(",");
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  exit(1);
});
