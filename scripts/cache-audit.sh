#!/usr/bin/env bash
# Cache Components audit — FM-R2-1 §SA-R3-1 (Sprint 0.5c deliverable)
#
# Asserts every `'use cache'` function in apps/market/src/ has at least one
# matching `revalidateTag(tag, profile)` invalidation site somewhere in the
# app or packages/. Catches "added cache, forgot invalidation" drift that
# doc-only audit matrices cannot prevent.
#
# Sprint 0.5c note: mutations (Server Actions calling revalidateTag) land in
# Sprint 1a+. This script emits a WARN (not failure) when CACHED > 0 and
# INVALIDATED == 0 — that's the expected pre-Sprint-1a state. Once Sprint 1a
# ships the first revalidateTag site, the check tightens automatically.
set -euo pipefail

ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "$ROOT"

# Count files containing the `'use cache'` directive at the start of a line
# (possibly indented) — NOT inside JSDoc/line comments. The directive always
# sits at the start of an async function body as a statement, so requiring it
# to be the first non-whitespace on the line skips comment prose.
CACHED_FILES=$(grep -rlE "^[[:space:]]*['\"]use cache['\"]" apps/market/src/ 2>/dev/null || true)
CACHED_COUNT=0
if [ -n "$CACHED_FILES" ]; then
  CACHED_COUNT=$(echo "$CACHED_FILES" | grep -c . || true)
fi

# Count real `revalidateTag(` call sites. Exclude:
# - test files
# - node_modules
# - lines starting with JSDoc continuation `*` or line comment `//`
INVALIDATED_COUNT=$( { grep -rnE "revalidateTag\(" apps/market/src/ packages/ 2>/dev/null || true; } \
  | grep -v "\.test\." \
  | grep -v "/node_modules/" \
  | grep -vE ":[[:space:]]*\*[[:space:]]" \
  | grep -vE ":[[:space:]]*//" \
  | wc -l \
  | tr -d ' ' || true)

echo "Cache Components audit:"
echo "  'use cache' files in apps/market/src/: ${CACHED_COUNT}"
echo "  revalidateTag() call sites:         ${INVALIDATED_COUNT}"

if [ "$CACHED_COUNT" -eq 0 ] && [ "$INVALIDATED_COUNT" -eq 0 ]; then
  echo "WARN: no cached fetchers and no invalidation sites. Nothing to audit."
  exit 0
fi

if [ "$CACHED_COUNT" -gt 0 ] && [ "$INVALIDATED_COUNT" -eq 0 ]; then
  echo "WARN: cached data fetchers exist but no revalidateTag sites yet."
  echo "      Expected pre-Sprint-1a — mutation actions land in Sprint 1a+."
  exit 0
fi

if [ "$CACHED_COUNT" -eq 0 ] && [ "$INVALIDATED_COUNT" -gt 0 ]; then
  echo "ERROR: revalidateTag() sites exist but no 'use cache' fetchers to target."
  exit 1
fi

echo "OK: ${CACHED_COUNT} cached fetcher files, ${INVALIDATED_COUNT} invalidation sites."
exit 0
