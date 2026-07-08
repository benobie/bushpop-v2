# Support widget (Chatwoot) — activation steps

The Chatwoot support-chat widget is coded and merged (`apps/market/src/components/chatwoot-widget.tsx`,
mounted in `apps/market/src/app/layout.tsx`) but ships **dormant** — it no-ops unless
both env vars below are baked into the `web` image at build time. This is
deliberate (batch 45, session E, 08/07/2026): Ben may be mid-walkthrough on
staging, and Coolify resets any compose-defaulted env on every deploy (see
`docs/engine/OPS-RUNBOOK.md` §Environment contract), so wiring + activating
in the same session risks an unwanted mid-walkthrough redeploy.

## Why it's build-time, not runtime

Next.js inlines `NEXT_PUBLIC_*` vars into the client bundle at `next build`
time — setting them as a container runtime env var does nothing. They must be
passed as Docker build args, which is why `apps/market/Dockerfile` and
`infra/docker-compose.engine.prod.yml`'s `web.build.args` block both declare
them with an empty-string default (`${VAR:-}`) — the exact same pattern
already used for `NEXT_PUBLIC_POSTHOG_KEY` and
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## The two vars

| Var | Value | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_CHATWOOT_BASE_URL` | `https://support.bushpop.xyz` | The live Chatwoot instance (Bushpop W5). |
| `NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN` | See `~/.claude/.secrets/chatwoot-widget.env` | Chatwoot inbox `Bushpop Support` (id 1, `Channel::WebWidget`) — fetched via `GET /api/v1/accounts/2/inboxes` using the existing `~/.claude/.secrets/chatwoot-api-token`. Reused the existing inbox rather than creating a second one — Chatwoot's one "website" inbox is already the widget this batch embeds; a duplicate inbox would just split conversations across two views for no reason. |

## Activation

1. In Coolify, open the `bushpop-engine` app (uuid `w1be995ronuhl7092d4jr392`) →
   Environment Variables, and add both vars above with their real values.
2. Trigger a redeploy: `POST /api/v1/deploy?uuid=w1be995ronuhl7092d4jr392`
   (or via the Coolify UI). This rebuilds the `web` image with the new build
   args baked in.
3. Verify: load `https://market.bushpop.xyz`, confirm the Chatwoot launcher
   bubble renders bottom-right, and that a test message lands as a new
   conversation in the `Bushpop Support` inbox at `https://support.bushpop.xyz`.

## Optional hardening (not done this session)

The `Bushpop Support` inbox's `allowed_domains` is currently empty (no
domain restriction — the widget will run wherever the token is embedded).
Restricting it to `https://market.bushpop.xyz,https://bushpop.com.au` via
`PATCH /api/v1/accounts/2/inboxes/1` with `{"channel": {"allowed_domains": "..."}}`
would be a reasonable follow-up, but this session's attempt to do so was
blocked by the auto-mode classifier as an unrequested live-prod-resource
change — left for Ben to approve explicitly or do via the Chatwoot UI
(Settings → Inboxes → Bushpop Support → Configuration).
