# Task W0c — Measurement diagram SVGs

## Where this fits

The sell wizard's "Condition & measurements" step shows a numbered SVG diagram matching the
measurement fields being asked for (a dress asks for bust/waist/hip/length with a diagram
showing exactly those 4 lines). This task builds those diagrams as React components. It does
NOT build the measurements step form itself — just the diagrams, ready to be imported later.

## Repo

Worktree root: `/Users/ben/projects/bushpop-v2.worktrees/feat/phase-2-sell-wizard`
Work only inside `apps/market/src/components/sell/svg/**`. Do not touch `apps/web/**`,
`packages/**`, or root config.

## Precedent to follow exactly

Read `apps/web/src/components/measurement-diagram.tsx` in full first — it already implements
two of these diagrams (top, bottoms) for a different context (a content guide page). Match its
patterns precisely:
- `ArrowDefs({id})` shared marker-arrowhead helper, unique `id` prefix per diagram to avoid
  `<marker>` id collisions when multiple diagrams render on the same page.
- `Label({x, y, children, rotate})` helper with the white paint-order halo so labels stay
  legible over the garment fill.
- `GARMENT` (fill/stroke/strokeWidth) and `MEASURE` (stroke/strokeWidth) style constants.
- Each `<svg>` has `role="img"` and `aria-labelledby="{id}-title {id}-desc"`, with a `<title>`
  and `<desc>` describing what's shown.
- Solid lines for outer garment outline, dashed (`strokeDasharray="5 4"`) for internal
  measurement lines like waist/hip, matching the existing top/bottoms examples.

## What to build — 7 templates, one file each in `apps/market/src/components/sell/svg/`

The measured keys per template come from
`packages/config/src/measurement-templates.ts` (`MEASUREMENT_TEMPLATES`) — read that file for
the exact key lists and labels (`MEASUREMENT_KEY_LABELS`). Build a diagram for each showing
ONLY the keys listed for that template (do not invent extra measurement lines):

1. `top-diagram.tsx` → `TopMeasurementDiagram` — keys: chest, shoulder, length, sleeve. You can
   closely adapt the existing `TopDiagram` from `measurement-diagram.tsx` (same garment shape),
   renamed and re-exported for this context — just rename the label "Bust / chest" to "Chest"
   to match this template's key label.
2. `dress-diagram.tsx` → `DressMeasurementDiagram` — keys: chest, waist, hip, length. Adapt the
   top garment outline but extend it into a dress silhouette (longer hem) with 4 measurement
   lines (chest near armpit, waist at narrowest point, hip below that, length shoulder-to-hem).
3. `bottoms-diagram.tsx` → `BottomsMeasurementDiagram` — keys: waist, hip, rise, inseam,
   leg_opening. Adapt the existing `BottomsDiagram`, adding rise (waistband to crotch seam,
   vertical) and leg_opening (across the ankle hem, horizontal) lines it currently lacks.
4. `skirt-diagram.tsx` → `SkirtMeasurementDiagram` — keys: waist, hip, length. A simple
   trapezoid/A-line skirt outline with waist (top), hip (below waist), length (vertical,
   waistband to hem).
5. `shoes-diagram.tsx` → `ShoesMeasurementDiagram` — keys: insole only. A simple shoe-sole
   outline (side profile or top-down outline) with one measurement line, heel to toe, labelled
   "Insole length".
6. `bag-diagram.tsx` → `BagMeasurementDiagram` — keys: width, height, strap_drop, depth. A bag
   silhouette (rectangle body + strap) with width (across the front), height (vertical, base to
   top), depth (across the side gusset), and strap_drop (strap top to bag top, vertical, off to
   one side).
7. `default-diagram.tsx` → `DefaultMeasurementDiagram` — keys: width, length. A generic flat-lay
   rectangle/blob outline with just those two lines — used for anything that doesn't match a
   more specific template.

Each component takes no props (self-contained), returns a `<figure>` wrapping the `<svg>` plus a
short `<figcaption>` (one sentence, matching the template's `caption` field in
`MEASUREMENT_TEMPLATES` from the config file — reuse that exact caption text).

8. `index.ts` — barrel file exporting all 7 components AND a dispatcher component
   `MeasurementDiagram({ templateKey }: { templateKey: MeasurementTemplateKey })` that switches
   on `templateKey` (import the type from `@bushpop/config`) and renders the matching diagram.

## Colours

Use `currentColor` for the garment stroke/fill where sensible, or hard-code the same neutral
greys the precedent file uses (`#f3f4f6` fill, `#9ca3af` / `#374151` strokes) — these are
deliberately neutral per the precedent file's own comment ("Styling is intentionally neutral...
so the Launch-2 brand system can re-skin it"). Do NOT invent new `--sell-*` CSS variable
dependencies here; keep these components dependency-free (no CSS file import), matching the
precedent's zero-client-JS, RSC-friendly approach.

## Acceptance criteria

- `pnpm --filter @bushpop/market typecheck` clean.
- Every SVG has `role="img"`, unique marker IDs per instance (prefix each with the template
  name, e.g. `measure-dress`), and a `<title>`/`<desc>` pair.
- All 7 templates' `keys` arrays from `MEASUREMENT_TEMPLATES` are fully represented (one
  measurement line per key, no extras, no omissions).
- `index.ts` dispatcher covers all 7 `MeasurementTemplateKey` values (TypeScript should error if
  a key is missing from the switch — use an exhaustive switch with a `never` check in the
  default case).

## Report

Report DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED, the commit hash(es), a one-line
typecheck summary, and any concerns (e.g. if a template's geometry was hard to represent
clearly). Commit with message prefix `feat(market): `.
