# Task W0f — Score-parity unit tests for the shared listing-strength module

## Where this fits

`packages/config/src/listing-strength.ts` (already built in Phase 1) is THE single shared
rubric used by the backend drafts API, the score worker, AND the sell wizard you're about to
build. Before building any wizard UI, we need parity tests proving the module produces the
exact scores the original design prototype's rubric produced (with day-1 exclusions applied),
so nobody accidentally forks the scoring logic later. This task is tests only — no UI, no
wizard code.

## Repo

Worktree root: `/Users/ben/projects/bushpop-v2.worktrees/feat/phase-2-sell-wizard`
Create test files under `apps/market/src/lib/sell/__tests__/` (new directory — this is where
the wizard's own store/logic code will live later, so co-locate the parity tests there even
though the module under test lives in `packages/config`). Do not modify
`packages/config/src/listing-strength.ts` itself — if you find what looks like a bug, report it
as a concern, don't fix it in this task.

## Read first

1. `packages/config/src/listing-strength.ts` — the module under test. Read the whole file,
   including its header comment explaining D19 (offers excluded day 1, so the "complete"
   fixture parity score is **75, not 77** — the design prototype's suite scored a complete
   draft at 77 points because it included the 2-point offers bonus; that bonus is excluded here
   via `offersEnabled: false`, so the equivalent complete draft in this codebase's tests scores
   75, not 77).
2. `/Users/ben/projects/Bushpop/design/home/qa/sell-test-2-resume-draft.js` — the original
   design-prototype jsdom suite. It seeds a seller draft in `localStorage` and asserts a score
   of 77 on resume. Read it to find the exact seeded draft field values (photos count, title,
   brand, category, size, colour, description, condition, measurements, price, RRP — whatever
   the seeded fixture object contains).
3. `/Users/ben/projects/Bushpop/design/home/qa/sell-test-1-clickthrough.js` — has a "score 100
   when complete" assertion (search the file for "100" or `score`) using a fully-filled draft.
   Read it to find that fixture's field values too.

## What to build

Two test files (or one file with two `describe` blocks — your choice, keep it readable):

1. **75-fixture test** — translate the suite-2 seeded draft's field values into a
   `ListingStrengthInput` object (map prototype field names to the module's input shape:
   `photoCount`, `title`, `brand`, `categoryLeaf`, `size`, `sizeExempt` (false unless the seeded
   category is a bag), `colour`, `description`, `condition`, `hasMeasurements` (true if the
   seeded draft has any measurement values), `priceCents`, `rrpCents`, `offersEnabled: false`).
   Call `computeListingStrength(input)` and assert `result.score === 75`. Add a comment
   explaining the 77→75 delta (offers excluded, D19) right above the assertion so nobody "fixes"
   it back to 77 later.
2. **Complete-fixture test** — same translation for the suite-1 "complete draft" fixture (the
   one that scored 100 in the prototype, which already excludes offers from the visible-100
   assertion since the prototype capped at 100 either way — read the suite-1 file carefully to
   confirm whether that particular fixture already omits offers or would need adjusting; if the
   prototype fixture used offers to reach 100, you'll need `offersEnabled: false` and confirm the
   *remaining* fields alone are enough to hit 100 — since the rubric without offers still sums to
   98 max on required fields (do the arithmetic from `STRENGTH_MAX_POINTS` in the module: 20 +
   10 + 5 + 10 + 10 + 5 + 10 + 10 + 10 + 10 + 3 = 103, so 100 is reachable and capped even
   without the 2-point offers bonus — the module already caps at 100). Assert
   `result.score === 100` for the fully-filled fixture with `offersEnabled: false`.
3. Also assert the `breakdown` object's per-component values look sane for at least one fixture
   (e.g. `breakdown.photos === 20` when `photoCount >= 4`, `breakdown.offers === 0` since
   offers is disabled) — this catches a broken breakdown even if the summed score happens to be
   right by coincidence.

## Acceptance criteria

- `pnpm --filter @bushpop/market typecheck` clean.
- If `apps/market/vitest.config.ts` exists (parallel task W0a), `pnpm --filter @bushpop/market
  test` runs these and they pass. If it doesn't exist yet when you finish, still write the
  files correctly (they should type-check and be logically correct) and note the dependency in
  your report — don't skip the task.
- Import `computeListingStrength` and its types from `@bushpop/config` (the package's public
  export — check `packages/config/src/index.ts` re-exports `listing-strength.ts`'s exports; if
  it doesn't, that's a real gap — report it as a concern rather than silently importing from a
  deep path like `@bushpop/config/src/listing-strength`).

## Report

Report DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, the commit hash(es), the exact
fixture field values you extracted from the two prototype QA files (so the reviewer can
cross-check them), a one-line test summary, and any concerns. Commit with message prefix
`test(market): `.
