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

// Best-effort rate limit: per-isolate memory, resets when the isolate recycles.
// Good enough to blunt naive form spam; not a security boundary.
const RATE_LIMIT = 5;
const WINDOW_MS = 60_000;
const hits = new Map();

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
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

  if (typeof body.company === "string" && body.company.trim() !== "") {
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
