# Task W0a — Test tooling scaffold for apps/market

## Where this fits

`apps/market` (the bushpop-v2 Launch-2 marketplace app, forked from piklo-v2) has never had a
test setup — no vitest, RTL, MSW, jsdom, or Playwright. We're about to build a large "List an
item" sell wizard feature (multi-step form, Zustand store, AI draft reveal, photo upload) in
this app and every subsequent task needs test tooling in place first. This task ONLY sets up
the tooling and proves it works with trivial smoke tests — it does not write any wizard code.

## Repo

Worktree root: `/Users/ben/projects/bushpop-v2.worktrees/feat/phase-2-sell-wizard`
Work only inside `apps/market/**`. Do not touch `apps/web/**`, `packages/**`, or root config
files. pnpm workspace monorepo, TypeScript strict, Next.js 16 App Router, React 19.

## What to build

1. `apps/market/vitest.config.ts` — vitest config using `jsdom` environment, path alias `@/*` →
   `./src/*` (match `apps/market/tsconfig.json`), `setupFiles: ["./src/test/setup.ts"]`,
   `globals: true` so `describe/it/expect` don't need explicit imports. Look at
   `packages/api/vitest.config.ts` in this repo first for the sibling project's style
   conventions (reporter settings etc.) but note that package uses `node` environment — you
   need `jsdom` here since this app renders React components.
2. `apps/market/src/test/setup.ts` — imports `@testing-library/jest-dom` matchers, and sets up
   an MSW server lifecycle:
   ```ts
   import { server } from "./msw/server";
   beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
   afterEach(() => server.resetHandlers());
   afterAll(() => server.close());
   ```
3. `apps/market/src/test/msw/server.ts` — exports `server = setupServer()` from `msw/node` with
   an empty default handlers array (`setupServer()`). Later tasks will add handlers per-test via
   `server.use(...)`; this file just provides the shared server instance.
4. `apps/market/playwright.config.ts` — `testDir: "./e2e"`, one project (`chromium`), `use:
   { baseURL: "http://localhost:3002" }`, `webServer: { command: "pnpm dev", url:
   "http://localhost:3002", reuseExistingServer: true, timeout: 120_000 }`. Do NOT try to run
   Playwright yourself — your sandbox cannot bind ports or run dev servers. Just write the
   config and the spec file below; a human/controller will run it separately once the local API
   + market dev servers are up.
5. `apps/market/e2e/smoke.spec.ts` — a trivial Playwright spec: `test("home page responds", ...)`
   that navigates to `/` and asserts the response status is < 400. Keep it minimal — this only
   proves the config wires up, not real coverage.
6. One vitest smoke test, e.g. `apps/market/src/test/smoke.test.tsx`: render a trivial inline
   component with `@testing-library/react`'s `render()` and assert it's in the document. Prove
   jsdom + RTL + jest-dom matchers all work together.
7. Update `apps/market/package.json` scripts: add `"test": "vitest run"`, `"test:watch":
   "vitest"`, `"test:e2e": "playwright test"`. Do not remove or rename existing scripts
   (`dev`, `build`, `start`, `typecheck`).

## Acceptance criteria

- `pnpm --filter @bushpop/market test` runs and the smoke test passes.
- `pnpm --filter @bushpop/market typecheck` is clean (no new errors).
- All new files are TypeScript, strict-mode clean, follow existing repo conventions (no default
  exports for utility modules unless that's already the local pattern — check a couple of
  existing files in `apps/market/src` first).

## Report

Report DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, the commit hash(es), a one-line test
summary (command run + pass count), and any concerns. Commit with message prefix
`test(market): `.
