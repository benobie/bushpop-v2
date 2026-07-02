# support-order-context

Thin integration for the Bushpop Chatwoot support inbox. Adds a Chatwoot
["Dashboard App"](https://www.chatwoot.com/docs/product/features/dashboard-apps)
— an iframe panel in the conversation sidebar — that shows the current
contact's WooCommerce order history, so an agent doesn't have to leave
Chatwoot or log into wp-admin to answer "where's my order".

## Why this design

- **No database of its own.** Real order/shipment data lives only in
  WooCommerce + Dokan on `bushpop.com.au` (a different VPS to the one
  Chatwoot runs on). The Supabase `bushpop` schema is a PII-stripped
  analytics copy (hashed emails, no names/addresses) and cannot power a
  per-buyer lookup — see the W5 handoff for the full reasoning. This service
  is a stateless proxy: every request is a live call to WooCommerce's REST
  API, server-side.
- **Zero dependencies, no build step.** Plain Node 22 (`http`, `crypto`,
  `fetch` are all built in). Deployed as a bind-mounted single file into a
  stock `node:22-alpine` image — no Dockerfile, no `npm install`, matching
  this repo's existing zero-build container pattern (see the homelab
  `weather-widget` service).
- **Read-only WooCommerce key.** Deliberately does NOT reuse the existing
  `read_write` "Claude AI" WooCommerce key used by the n8n buyer-metrics ETL
  — this service is internet-facing and only ever needs `GET`, so it gets
  its own key scoped to Read only (least privilege).

## Endpoints

Served behind Caddy at `https://support.bushpop.xyz/order-context/*`, which
strips the `/order-context` prefix before proxying here — so the app's own
routes are just `/` and `/api/orders`.

- `GET /` — the iframe HTML+JS. Listens for Chatwoot's Dashboard App
  `postMessage` (delivers `{conversation, contact, ...}` to the iframe),
  extracts the contact's email, then calls `/api/orders` itself.
- `GET /api/orders?token=<token>&email=<email>` — token-gated JSON API.
  Checks `token` against `ORDER_CONTEXT_TOKEN` with a constant-time compare
  before doing anything else; missing/wrong token → `403`, logged (no
  WooCommerce call made). On a valid token, resolves a WooCommerce customer
  by email, falls back to an order search for guest checkouts, and returns a
  slim order list (id, number, date, status, total, currency, line items).

## Security note

This endpoint discloses real customer order history by email, and Chatwoot
Dashboard Apps carry no bearer token of their own — the shared-secret
`token` query param (configured once as a static param on the Dashboard App
URL in Chatwoot's settings) is the access control. Treat `ORDER_CONTEXT_TOKEN`
and the WooCommerce credentials as secrets: never commit real values here,
only `.env.example` placeholders. Every lookup is logged to stdout
(`docker logs chatwoot-order-context`).

## Deploy

Not part of the pnpm workspace (`pnpm-workspace.yaml` only includes
`apps/*`) — this directory is invisible to the monorepo's install/build/CI.
It's deployed by rsyncing this directory to the VPS and running it as the
`order-context` service inside the `chatwoot` docker-compose project
(`~/docker/chatwoot/docker-compose.yml` on the homelab VPS), not built or
served from this repo directly.

```bash
rsync -avz --exclude='.env' --exclude='node_modules' \
  ~/projects/bushpop-v2/services/support-order-context/ \
  benmate@154.26.158.150:/home/benmate/docker/chatwoot/order-context/
```

## TODO — verify before finalizing

The exact `postMessage` payload shape Chatwoot's Dashboard App sends has
shifted across versions historically. `server.js`'s `extractEmail()` tries
the currently-documented shape plus a couple of plausible fallbacks — once
Chatwoot is live, open a real Dashboard App iframe, `console.log(event.data)`
in devtools, confirm the real shape, and trim the fallbacks accordingly.
