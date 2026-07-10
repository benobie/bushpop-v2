/**
 * Cloudflare Pages Function — first-party waitlist capture (F1).
 *
 * POST /api/waitlist  { email, segment?, source?, company? }
 *   segment: "buyer" | "seller" | "opshop", default "buyer" (F10 contract —
 *   seller/op-shop landing pages pre-segment the list at signup).
 *   company: honeypot. A non-empty value means a bot filled the hidden field —
 *   respond with fake success and drop the submission.
 *
 * Forwards valid signups to the n8n webhook in N8N_WAITLIST_WEBHOOK (a CF Pages
 * secret — the URL is the only auth, so it must never appear in this public repo).
 * n8n stores rows in homelab Postgres `bushpop.waitlist` and is the future hook
 * for the F11a welcome email. Full architecture + export path: docs/waitlist.md.
 *
 * PII discipline: never log the email.
 */

const SEGMENTS = new Set(["buyer", "seller", "opshop"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Only our own pages may post here. A browser always sends `Origin` on a POST
// (fetch spec), so a missing or foreign origin is not a real form submission.
// Scripted abuse can of course forge the header — this is a cheap filter that
// removes the drive-by class, not an authentication boundary. See the residual
// gap note below.
const ALLOWED_ORIGINS = new Set([
  "https://bushpop.com.au",
  "https://www.bushpop.com.au",
  "https://bushpop-v2.pages.dev",
  "http://localhost:3000",
  // `wrangler pages dev` — the only local server that actually runs Functions.
  "http://localhost:8788",
]);

// Best-effort rate limit: per-isolate memory, resets when the isolate recycles
// and is not shared across the many isolates Pages runs. Blunts a naive loop
// from one client; a distributed or reconnecting client walks straight past it.
// A real limiter needs a KV/Durable Object binding or Turnstile on the form —
// both require new project config, so neither ships here.
const RATE_LIMIT = 5;
const WINDOW_MS = 60_000;
const hits = new Map();

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The `Origin` header, or the origin of `Referer` when a client strips it. */
function requestOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin) return origin;
  const referer = request.headers.get("Referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export async function onRequestPost(context) {
  const origin = requestOrigin(context.request);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return json(403, { ok: false, error: "forbidden_origin" });
  }

  const ip = context.request.headers.get("CF-Connecting-IP") ?? "unknown";
  const now = Date.now();
  if (hits.size > 1000) hits.clear();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return json(429, { ok: false, error: "rate_limited" });
  recent.push(now);
  hits.set(ip, recent);

  let body;
  try {
    const raw = await context.request.text();
    if (raw.length > 2048) return json(400, { ok: false, error: "too_large" });
    body = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }
  if (typeof body !== "object" || body === null) {
    return json(400, { ok: false, error: "bad_json" });
  }

  // Honeypot. Absent, null, or an empty string is a real human leaving the
  // hidden field alone; anything else (including a non-string value that would
  // slip past a `typeof` check) is a bot, and gets a fake success.
  const company = body.company;
  const companyFilled =
    company !== undefined &&
    company !== null &&
    (typeof company !== "string" || company.trim() !== "");
  if (companyFilled) {
    return json(200, { ok: true });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return json(400, { ok: false, error: "invalid_email" });
  }

  const segment = body.segment ?? "buyer";
  if (!SEGMENTS.has(segment)) {
    return json(400, { ok: false, error: "invalid_segment" });
  }

  const source = typeof body.source === "string" ? body.source.slice(0, 100) : null;

  const webhook = context.env.N8N_WAITLIST_WEBHOOK;
  if (!webhook) return json(500, { ok: false, error: "not_configured" });

  const upstream = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, segment, source }),
  });
  if (!upstream.ok) return json(502, { ok: false, error: "upstream" });

  return json(200, { ok: true });
}
