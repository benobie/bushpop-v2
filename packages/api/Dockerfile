# Bushpop API — Fastify + 17 in-process BullMQ workers.
# Runs via `tsx src/index.ts` (NOT `node dist`): @bushpop/config and @bushpop/types
# export raw ./src/index.ts with no build script, so a compiled dist can't
# resolve its workspace imports at runtime. See docs/OPS-RUNBOOK.md.
#
# Build context = repo root:  docker build -f packages/api/Dockerfile .
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
WORKDIR /app

# --- deps layer: copy only manifests so the install is cached across source edits ---
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
COPY apps/market/package.json ./apps/market/
COPY apps/web/package.json ./apps/web/
COPY packages/api/package.json ./packages/api/
COPY packages/db/package.json ./packages/db/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY packages/api-client/package.json ./packages/api-client/
# Keep dev deps: tsx (runtime) + drizzle-kit (migrate-on-boot) are required.
# Do NOT set NODE_ENV=production before install — pnpm would still keep dev
# deps, but we leave it unset here to be explicit. sharp's Linux prebuilt
# binary comes from the @img/sharp-linux-x64 optional dependency (glibc base).
RUN pnpm install --frozen-lockfile

# --- source ---
# node_modules is excluded by .dockerignore, so this never clobbers the install.
# Source is owned by the built-in non-root `node` user; node_modules / the pnpm
# store stay root-owned but are world-readable, so node (uid 1000) can read and
# execute them at runtime without a costly `chown -R` of the dep tree. See INF-H1.
COPY --chown=node:node . .
RUN chmod +x packages/api/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3333

# Drop to the non-root `node` user before running migrations + the server.
# pnpm/tsx/drizzle-kit only READ the root-owned dep tree; pnpm's cache resolves
# to /home/node/.cache (writable), so script runs need no root. See INF-H1.
# NOTE (INF-M1): this image still ships dev deps (tsx + drizzle-kit are REQUIRED
# at runtime — see the header). A `--prod` install would drop them and break
# boot; the only safe slim is a tsup bundle that produces a real `node dist`
# artifact (noExternal: [/@bushpop/]). Deferred as a pre-GMV hardening task —
# trade-off: ~400MB larger image + wider attack surface until then.
USER node

# Liveness probe uses Node's global fetch (no curl/wget in the slim image).
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://localhost:3333/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["packages/api/docker-entrypoint.sh"]
