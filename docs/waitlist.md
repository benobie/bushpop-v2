# Waitlist capture (F1)

First-party email capture for the pre-launch waitlist. Shipped out-of-band from
fleet 1 by batch-35-C (03/07/2026). The list is a launch asset — first-party
storage only, no third-party form service.

## Architecture

```
WaitlistForm (client island, homepage + /shop)
  → POST /api/waitlist                        same-origin CF Pages Function
    apps/web/functions/api/waitlist.js        validate + honeypot + rate limit
      → n8n webhook (N8N_WAITLIST_WEBHOOK)    CF Pages secret, production env
        n8n "Bushpop Waitlist Capture"        workflow id dGMIO7NbJCIwv08R
          → bushpop.add_waitlist_signup()     SECURITY DEFINER RPC, homelab Postgres
            → bushpop.waitlist                table (email, segment, source, created_at)
```

- **Segment contract (F10):** `buyer` | `seller` | `opshop`, default `buyer`.
  `WaitlistForm` takes a `segment` prop; the seller/op-shop landing pages (F10)
  pass their own value so the list is pre-segmented at launch.
- **Dedup:** unique on `(email, segment)`; emails normalised to lowercase in the
  RPC. Duplicate signups are a silent no-op (form still shows success).
- **Anti-spam:** hidden `company` honeypot field (filled → fake success, dropped)
  plus a best-effort per-isolate rate limit (5/min per IP) in the Function.
- **PII:** the Function never logs emails; `source` is just the page pathname.
- **F11a hook:** the welcome-email automation chains onto the n8n workflow after
  the insert node. Not built yet — deliberate.

## Secrets

`N8N_WAITLIST_WEBHOOK` is a CF Pages secret on project `bushpop-v2` (production
env). The n8n webhook URL is the only auth on the pipe, and this repo is PUBLIC —
the URL must never be committed. Manage it with:

```bash
cd apps/web
pnpm dlx wrangler pages secret put N8N_WAITLIST_WEBHOOK --project-name bushpop-v2
```

To rotate: change the webhook path on the n8n workflow (Waitlist Webhook node),
re-activate, then re-run the secret put. For local testing, put the URL in
`apps/web/.dev.vars` (gitignored) as `N8N_WAITLIST_WEBHOOK=https://…` and run
`pnpm dlx wrangler pages dev out` from `apps/web`.

## Exporting the list

```bash
ssh benmate@154.26.158.150 "docker exec supabase-db psql -U postgres -Atc \"\\copy (select email, segment, source, created_at from bushpop.waitlist order by created_at) to stdout csv header\"" > waitlist.csv
```

The table also rides the existing `pg_dump -n bushpop` sellability boundary, and
`life_dashboard_reader` has SELECT for dashboard surfaces.

## Verifying end-to-end

```bash
curl -sS -X POST https://bushpop-v2.pages.dev/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"probe@example.com","segment":"buyer","source":"manual-verify"}' -w "\n%{http_code}\n"
```

Expect `{"ok":true}` / 200, then a row in `bushpop.waitlist`. Delete test rows:
`delete from bushpop.waitlist where source in ('manual-verify');`
