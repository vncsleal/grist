#!/usr/bin/env bash
set -euo pipefail

# Local CI simulator — runs the exact same steps as .github/workflows/ci.yml
# but on your host, so you catch failures before wasting GitHub Actions quota.
#
# Usage: bash scripts/ci-local.sh
#
# Prerequisites:
#   - Node >=22.12.0 (see .nvmrc / package.json engines)
#   - pnpm installed (corepack enabled)
#   - pnpm install already ran

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── CI environment mirror ──────────────────────────────────────────
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144}"
export CI=true

# colour helpers
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
step()  { printf "\n━━━ %s ━━━\n" "$*"; }

FAILED=0
run() {
  step "$1"
  if bash -c "$2"; then
    green "✓ $1"
  else
    red "✗ $1"
    FAILED=1
  fi
}

# ── CI jobs ────────────────────────────────────────────────────────

run "Security audit"     "pnpm audit --audit-level=high 2>/dev/null; true"
run "Lint"               "pnpm lint"
run "Typecheck"           "pnpm typecheck"
run "Unit tests"          "pnpm test:unit"
run "Build"               "pnpm build"

# ── Summary ────────────────────────────────────────────────────────
echo ""
if [ "$FAILED" -eq 0 ]; then
  green "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  green "  All CI steps passed!"
  green "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  red   "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  red   "  Some CI steps failed — scroll up for details"
  red   "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
