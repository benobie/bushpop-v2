# Phase 2 Sell Wizard — Progress Ledger

Worktree: /Users/ben/projects/bushpop-v2.worktrees/feat/phase-2-sell-wizard
Branch: feat/phase-2-sell-wizard
Base commit at start: ca1e92e

## Session setup
- [x] Worktree created + bootstrapped
- [x] onlyBuiltDependencies added to root package.json (sharp/esbuild/etc), pnpm install clean
- [x] apps/market deps added: zustand, browser-image-compression, vitest, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, jsdom, msw, @playwright/test
- [x] Local dev stack up (bushpop-db :5435, bushpop-redis :6380, bushpop-meilisearch :7701)
- [ ] .env wired for local api/market dev (needed before Wave 3 E2E)

## Wave 0 (parallel, independent)
- [ ] W0a: test tooling scaffold (vitest+RTL+MSW+jsdom+playwright config)
- [ ] W0b: sell.css port
- [ ] W0c: measurement SVG diagrams
- [ ] W0d: analytics lib
- [ ] W0e: shared listing-preview-card
- [ ] W0f: score-parity unit tests

## Spine (sequential)
- [ ] S1: /sell scaffold + delete old piklo sell pages
- [ ] S2: store + draft-sync (Opus review required)
- [ ] S3: resume

## Wave 1
- [ ] W1a: photos step
- [ ] W1b: details step
- [ ] W1c: condition & measurements
- [ ] W1d: price step
- [ ] W1e: shipping step

## Wave 2
- [ ] W2a: AI reveal
- [ ] W2b: review + publish (Opus review required)
- [ ] W2c: aside + delight

## Wave 3
- [ ] W3a: QA parity tests
- [ ] W3b: Playwright E2E
- [ ] W3c: GA4 events

## Final
- [ ] Final whole-branch review
- [ ] PR opened (feature-grade — held for Ben/Fable, NOT auto-merged)
