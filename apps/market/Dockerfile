# Bushpop market — Next.js 16 (standalone output).
# Build context = repo root:  docker build -f apps/market/Dockerfile .
# The web app only imports pure constants/helpers + Tailwind CSS from
# @bushpop/config, so the build needs NO server secrets. API_BASE_URL is baked
# into the same-origin /api proxy rewrite at build time (next.config.ts).
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
WORKDIR /app

# --- builder ---
FROM base AS builder
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
COPY apps/market/package.json ./apps/market/
COPY apps/web/package.json ./apps/web/
COPY packages/api/package.json ./packages/api/
COPY packages/db/package.json ./packages/db/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/api-client/package.json ./packages/api-client/
RUN pnpm install --frozen-lockfile

COPY . .

# Internal service URL for the same-origin /api proxy (web container → api container).
ARG API_BASE_URL=http://api:3333
ENV API_BASE_URL=$API_BASE_URL
# Optional analytics key (public, safe to bake at build time).
ARG NEXT_PUBLIC_POSTHOG_KEY=""
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
# Stripe publishable key — public, baked at build time (Next inlines NEXT_PUBLIC_*).
# Without it the image ships loadStripe("") and every checkout silently fails to
# mount (no error thrown). Ben sets the pk_test_ value in Coolify. See INF-C1.
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
# R2 public media URL — next.config.ts derives images.remotePatterns' hostname
# from this at BUILD time. Without it the image bakes in the fallback hostname
# and next/image rejects every listing image served from the real R2 domain.
# Coolify forwards the real value as a build arg (compose web.build.args).
ARG R2_PUBLIC_URL=""
ENV R2_PUBLIC_URL=$R2_PUBLIC_URL
# Chatwoot support-widget — public, safe to bake at build time. Both must be
# set for the widget to activate (chatwoot-widget.tsx no-ops on either being
# empty); dormant by default until Ben sets them in Coolify. See docs/support-widget.md.
ARG NEXT_PUBLIC_CHATWOOT_BASE_URL=""
ENV NEXT_PUBLIC_CHATWOOT_BASE_URL=$NEXT_PUBLIC_CHATWOOT_BASE_URL
ARG NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN=""
ENV NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN=$NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN

RUN pnpm --filter @bushpop/market build

# --- runner ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# Next standalone bundle (monorepo layout → entry at apps/market/server.js).
# No public/ dir exists in apps/market, so nothing to copy there.
# Copied as the built-in non-root `node` user (uid 1000) so the runtime never
# runs as root — container escape lands as an unprivileged user. See INF-H1.
COPY --from=builder --chown=node:node /app/apps/market/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/market/.next/static ./apps/market/.next/static

USER node

EXPOSE 3000

# Container-level liveness so `docker run` (no compose) still has a health signal
# (INF-M2). Slim image has no curl/wget — use Node's global fetch. Require a real
# 2xx (r.ok), not just status<500, so a 404/301 can't read as healthy (INF-M3).
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/market/server.js"]
