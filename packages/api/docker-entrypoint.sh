#!/bin/sh
# Piklo API container entrypoint.
# Runs Drizzle migrations once (single replica → no race), then execs the
# server. The API process starts Fastify + all 13 in-process BullMQ workers
# and self-bootstraps the MeiliSearch `listings_piklo` index on onReady.
set -e

echo "[entrypoint] applying database migrations (drizzle-kit migrate)..."
# Emit a greppable marker on failure so a log alert can distinguish a migration
# crash-loop (boots, fails migrate, restarts, repeat) from a healthy restart.
# `restart: unless-stopped` will keep relaunching this container — see the
# OPS-RUNBOOK "Migrate-on-boot failure" note for the alert/teardown procedure.
if ! pnpm --filter @bushpop/db db:migrate; then
  echo "[entrypoint] !!! MIGRATION_FAILED — aborting boot; container will restart (alert + investigate, do not leave looping)" >&2
  exit 1
fi

echo "[entrypoint] starting API (tsx src/index.ts)..."
exec pnpm --filter @bushpop/api start:prod
