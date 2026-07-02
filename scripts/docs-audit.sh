#!/usr/bin/env bash
# Documentation audit — catches drift between code and docs.
#
# Checks:
#   1. Route count drift     — code routes vs documented routes in docs/api-routes.md
#   2. Worker count drift    — start*Worker calls vs rows in ARCHITECTURE.md worker table
#   3. CURRENT-STATE.md freshness — "Last updated" date must be within 14 days
#   4. Doc link integrity    — broken relative .md links inside docs/
#                              (also covers ONBOARDING.md "Where to Go Deeper")
#   5. Council session drift — .review-state-*.md files at repo root vs
#                              rows in CURRENT-STATE.md Council Sessions table
#
# Exit codes:
#   0 — all checks pass or warn only
#   1 — any ERROR (broken links)
set -euo pipefail

ROOT="${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}"
cd "$ROOT"

# Colour codes — only emit if stdout is a terminal or forced
if [ -t 1 ] || [ "${FORCE_COLOR:-}" = "1" ]; then
  RED="\033[0;31m"
  YELLOW="\033[0;33m"
  GREEN="\033[0;32m"
  RESET="\033[0m"
else
  RED="" YELLOW="" GREEN="" RESET=""
fi

ERRORS=0
WARNINGS=0

pass()  { printf "${GREEN}OK${RESET}   %s\n" "$1"; }
warn()  { printf "${YELLOW}WARN${RESET} %s\n" "$1"; WARNINGS=$((WARNINGS + 1)); }
error() { printf "${RED}ERROR${RESET} %s\n" "$1"; ERRORS=$((ERRORS + 1)); }

echo "Docs audit:"
echo ""

# ── 1. Route count drift ─────────────────────────────────────────────────────
CODE_ROUTES=$(grep -rn "app\.\(get\|post\|put\|patch\|delete\)(" \
  packages/api/src/routes/v1/ 2>/dev/null \
  | grep -v "\.test\." | wc -l | tr -d ' ')

DOC_ROUTES=$(grep -cE "^\| \`(GET|POST|PUT|PATCH|DELETE)\`" \
  docs/api-routes.md 2>/dev/null || true)

echo "  Routes — code: ${CODE_ROUTES}, documented: ${DOC_ROUTES}"
if [ "$CODE_ROUTES" -gt "$DOC_ROUTES" ]; then
  warn "Route drift: ${CODE_ROUTES} code routes but only ${DOC_ROUTES} documented in docs/api-routes.md"
else
  pass "Route count in sync (${CODE_ROUTES} code, ${DOC_ROUTES} documented)"
fi

# ── 2. Worker count drift ─────────────────────────────────────────────────────
CODE_WORKERS=$(grep -oE "start[A-Za-z]+Worker\(\)|startEventConsumer\(\)" \
  packages/api/src/workers/index.ts 2>/dev/null \
  | sort -u | wc -l | tr -d ' ')

# Worker table in ARCHITECTURE.md starts after the header "| Worker | Queue"
# Count data rows only (exclude header and separator lines)
DOC_WORKERS=$(awk '/^\| Worker \| Queue/{found=1; next} found && /^\|[-: ]+\|/{next} found && /^\|/{count++} found && /^[^|]/{exit} END{print count+0}' \
  docs/ARCHITECTURE.md 2>/dev/null || echo "0")

echo "  Workers — code: ${CODE_WORKERS}, documented: ${DOC_WORKERS}"
if [ "$CODE_WORKERS" -ne "$DOC_WORKERS" ]; then
  warn "Worker drift: ${CODE_WORKERS} start*Worker calls in workers/index.ts but ${DOC_WORKERS} rows in ARCHITECTURE.md worker table"
else
  pass "Worker count in sync (${CODE_WORKERS})"
fi

# ── 3. CURRENT-STATE.md freshness ────────────────────────────────────────────
CURRENT_STATE="docs/CURRENT-STATE.md"
if [ ! -f "$CURRENT_STATE" ]; then
  warn "docs/CURRENT-STATE.md not found — skipping freshness check"
else
  # Extract "Last updated: DD/MM/YYYY" — Australian date format
  DATE_LINE=$(grep -i "^\*\*Last updated:\*\*" "$CURRENT_STATE" | head -1 || true)
  if [ -z "$DATE_LINE" ]; then
    warn "CURRENT-STATE.md has no '**Last updated:**' line"
  else
    RAW_DATE=$(echo "$DATE_LINE" | grep -oE "[0-9]{2}/[0-9]{2}/[0-9]{4}" | head -1 || true)
    if [ -z "$RAW_DATE" ]; then
      warn "CURRENT-STATE.md 'Last updated' date not in DD/MM/YYYY format"
    else
      # Convert DD/MM/YYYY → YYYY-MM-DD for date arithmetic
      D=$(echo "$RAW_DATE" | cut -d/ -f1)
      M=$(echo "$RAW_DATE" | cut -d/ -f2)
      Y=$(echo "$RAW_DATE" | cut -d/ -f3)
      DOC_EPOCH=$(date -d "${Y}-${M}-${D}" +%s 2>/dev/null \
        || date -j -f "%Y-%m-%d" "${Y}-${M}-${D}" +%s 2>/dev/null || echo "0")
      NOW_EPOCH=$(date +%s)
      AGE_DAYS=$(( (NOW_EPOCH - DOC_EPOCH) / 86400 ))
      echo "  CURRENT-STATE.md — last updated: ${RAW_DATE} (${AGE_DAYS} days ago)"
      if [ "$AGE_DAYS" -gt 14 ]; then
        warn "CURRENT-STATE.md is ${AGE_DAYS} days old (threshold: 14 days)"
      else
        pass "CURRENT-STATE.md is fresh (${AGE_DAYS} days old)"
      fi
    fi
  fi
fi

# ── 4. Doc link integrity ─────────────────────────────────────────────────────
echo "  Checking doc links..."
BROKEN=0
while IFS= read -r mdfile; do
  # Extract relative .md links: [text](path/to/file.md) or [text](file.md)
  # Skip absolute URLs (http://, https://, file://) — only check relative paths.
  # Anchors (#section) are stripped before the existence check.
  while IFS= read -r link; do
    # Skip absolute URLs
    case "$link" in http://*|https://*|file://*) continue ;; esac
    # Strip anchor fragment
    target="${link%%#*}"
    [ -z "$target" ] && continue
    # Resolve relative to the directory of the source file
    dir=$(dirname "$mdfile")
    resolved="${dir}/${target}"
    if [ ! -f "$resolved" ]; then
      # Skip links to gitignored files — they are intentionally local-only
      # (e.g. .review-state-*.md council session files). The link works for
      # developers running locally but the file does not exist on CI.
      if git check-ignore -q "$resolved" 2>/dev/null; then
        continue
      fi
      error "Broken link in ${mdfile}: [${link}] → ${resolved} not found"
      BROKEN=$((BROKEN + 1))
    fi
  done < <(grep -oE '\[[^]]+\]\([^)]+\.md[^)]*\)' "$mdfile" 2>/dev/null \
    | grep -oE '\([^)]+\)' | tr -d '()' || true)
done < <(find "$ROOT/docs" -name "*.md" \
    -not -path "*/node_modules/*" \
    -not -path "*/docs/gpt-council/*" \
    -not -path "*/docs/handoffs/archive/*")

if [ "$BROKEN" -eq 0 ]; then
  pass "All doc links resolve"
fi

# ── 5. Council session count drift ────────────────────────────────────────────
# `.review-state-*.md` files at repo root are the gitignored source of
# council decisions. CURRENT-STATE.md surfaces them in its Council Sessions
# table. Warn on mismatch so stale councils (or missing rows) surface early.
COUNCIL_FILES=$(find "$ROOT" -maxdepth 1 -name ".review-state-*.md" 2>/dev/null | wc -l | tr -d ' ')

# Extract rows from the Council Sessions table in CURRENT-STATE.md.
# Table header is "| Session | Status | Est. Decisions |". Data rows
# follow the separator and start with "|". Stop at the next non-pipe line.
COUNCIL_DOC=$(awk '/^\| Session \| Status/{found=1; next} found && /^\|[-: ]+\|/{next} found && /^\|/{count++} found && /^[^|]/{exit} END{print count+0}' \
  docs/CURRENT-STATE.md 2>/dev/null || echo "0")

echo "  Council sessions — .review-state files: ${COUNCIL_FILES}, documented: ${COUNCIL_DOC}"
# .review-state-*.md is gitignored, so CI checkouts always have 0 files.
# Only run the drift check when files exist (developer running locally).
if [ "$COUNCIL_FILES" -eq 0 ]; then
  pass "Council session count check skipped (no .review-state-*.md files — gitignored, drift check runs locally only)"
elif [ "$COUNCIL_FILES" -ne "$COUNCIL_DOC" ]; then
  warn "Council drift: ${COUNCIL_FILES} .review-state-*.md files but ${COUNCIL_DOC} rows in CURRENT-STATE.md Council Sessions table"
else
  pass "Council session count in sync (${COUNCIL_FILES})"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Docs audit complete — ${ERRORS} error(s), ${WARNINGS} warning(s)"

if [ "$ERRORS" -gt 0 ]; then
  exit 1
fi
exit 0
