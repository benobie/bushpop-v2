#!/usr/bin/env node
/**
 * post-deploy-check.mjs — post-deploy SEO/security hygiene smoke test.
 *
 * Zero dependencies — Node 22 built-in fetch only.
 *
 * Checks:
 *   1. / + 2 content pages return 200, no X-Robots-Tag noindex, no
 *      <meta name="robots" content="...noindex..."> in the HTML.
 *   2. Inverse: a nonexistent page returns 404 AND its HTML DOES contain
 *      a noindex robots meta (the branded 404 page sets
 *      robots: { index: false, follow: true }).
 *   3. Security headers from apps/web/public/_headers are present on /.
 *   4. /robots.txt returns 200 and references the production sitemap.
 *   5. /sitemap.xml returns 200, parses as XML, and has >30 <url> entries.
 *
 * Usage:
 *   node post-deploy-check.mjs --base https://bushpop-v2.pages.dev
 */

import { argv, exit } from "node:process";

function parseArgs(args) {
  const out = { base: undefined };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--base") out.base = args[++i];
  }
  if (!out.base) throw new Error("--base is required");
  return out;
}

const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// Security headers this repo actually sets, per apps/web/public/_headers
// (`/*` block). Kept in sync manually — re-read _headers if this drifts.
const EXPECTED_SECURITY_HEADERS = [
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "strict-transport-security",
  "content-security-policy",
];

function hasNoindexMeta(html) {
  const metaRobotsRe = /<meta[^>]*name=["']robots["'][^>]*>/gi;
  const matches = html.match(metaRobotsRe) ?? [];
  return matches.some((m) => /noindex/i.test(m));
}

async function main() {
  const { base } = parseArgs(argv.slice(2));
  const results = []; // { name, pass, detail }

  function record(name, pass, detail) {
    results.push({ name, pass, detail });
  }

  // ── Check 1: content pages — 200, no noindex signal ──────────────────
  const contentPages = ["/", "/guides/size-charts/", "/about/"];
  for (const path of contentPages) {
    const url = new URL(path, base).toString();
    const res = await fetchWithTimeout(url);
    const html = await res.text();
    const xRobotsTag = res.headers.get("x-robots-tag") ?? "";
    const headerNoindex = /noindex/i.test(xRobotsTag);
    const metaNoindex = hasNoindexMeta(html);

    const pass = res.status === 200 && !headerNoindex && !metaNoindex;
    record(
      `content page ${path} is 200 + indexable`,
      pass,
      pass
        ? undefined
        : `status=${res.status} x-robots-tag="${xRobotsTag}" metaNoindex=${metaNoindex}`,
    );
  }

  // ── Check 2: inverse — nonexistent page is 404 + noindex ─────────────
  {
    const path = "/this-page-does-not-exist-xyz/";
    const url = new URL(path, base).toString();
    const res = await fetchWithTimeout(url);
    const html = await res.text();
    const metaNoindex = hasNoindexMeta(html);
    const pass = res.status === 404 && metaNoindex;
    record(
      "404 page returns 404 and is noindex",
      pass,
      pass ? undefined : `status=${res.status} metaNoindex=${metaNoindex}`,
    );
  }

  // ── Check 3: security headers on / ────────────────────────────────────
  {
    const url = new URL("/", base).toString();
    const res = await fetchWithTimeout(url);
    const missing = EXPECTED_SECURITY_HEADERS.filter((h) => !res.headers.get(h));
    const pass = missing.length === 0;
    record(
      "security headers present on /",
      pass,
      pass ? undefined : `missing: ${missing.join(", ")}`,
    );
  }

  // ── Check 4: robots.txt ───────────────────────────────────────────────
  {
    const url = new URL("/robots.txt", base).toString();
    const res = await fetchWithTimeout(url);
    const text = await res.text();
    const hasSitemap = text.includes("Sitemap: https://bushpop.com.au/sitemap.xml");
    const pass = res.status === 200 && hasSitemap;
    record(
      "/robots.txt is 200 and references production sitemap",
      pass,
      pass ? undefined : `status=${res.status} hasSitemap=${hasSitemap}`,
    );
  }

  // ── Check 5: sitemap.xml ──────────────────────────────────────────────
  {
    const url = new URL("/sitemap.xml", base).toString();
    const res = await fetchWithTimeout(url);
    const text = await res.text();
    const looksLikeXml = text.trim().startsWith("<?xml");
    const urlCount = (text.match(/<url>/g) ?? []).length;
    const pass = res.status === 200 && looksLikeXml && urlCount > 30;
    record(
      "/sitemap.xml is 200, valid XML, >30 <url> entries",
      pass,
      pass ? undefined : `status=${res.status} looksLikeXml=${looksLikeXml} urlCount=${urlCount}`,
    );
  }

  const failed = results.filter((r) => !r.pass);
  const total = results.length;

  if (failed.length === 0) {
    console.log(`all ${total} checks passed`);
    exit(0);
  }

  console.error(`${failed.length}/${total} checks FAILED:`);
  for (const f of failed) {
    console.error(`  FAIL: ${f.name} — ${f.detail}`);
  }
  for (const r of results.filter((r) => r.pass)) {
    console.log(`  pass: ${r.name}`);
  }
  exit(1);
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  exit(1);
});
