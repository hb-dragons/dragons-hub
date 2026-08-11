#!/usr/bin/env bash
# Regression test for deploy.yml's change-detection path filters (issue #98).
#
# Exercises the exact WEB_PATTERN / API_PATTERN used by the "determine-changes"
# job (sourced from change-patterns.sh, not copy-pasted) against representative
# changed-file lists, so the workflow and this test can never drift apart.
#
# Run: bash .github/scripts/change-patterns.test.sh
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

# shellcheck source=./change-patterns.sh
source .github/scripts/change-patterns.sh

pass=0
fail=0

# assert_match <pattern> <path> <true|false> <label>
assert_match() {
  local pattern="$1" path="$2" expect="$3" label="$4"
  local actual
  if echo "$path" | grep -qE "$pattern"; then actual=true; else actual=false; fi
  if [ "$actual" = "$expect" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL [$label]: path='$path' expected match=$expect, got $actual"
  fi
}

echo "== web pattern =="
# packages/contracts and packages/api-client feed the web build (api-client
# infers its types from contracts) — a change confined to either must deploy web.
assert_match "$WEB_PATTERN" "packages/contracts/src/games.ts" true "web/contracts"
assert_match "$WEB_PATTERN" "packages/api-client/src/games.ts" true "web/api-client"
assert_match "$WEB_PATTERN" "apps/web/src/app/page.tsx" true "web/apps-web"
assert_match "$WEB_PATTERN" "packages/ui/src/components/button.tsx" true "web/ui"
assert_match "$WEB_PATTERN" "packages/shared/src/constants.ts" true "web/shared"
# root-level build inputs must trigger web
assert_match "$WEB_PATTERN" "pnpm-lock.yaml" true "web/lockfile"
assert_match "$WEB_PATTERN" "turbo.json" true "web/turbo-json"
assert_match "$WEB_PATTERN" "apps/web/Dockerfile" true "web/own-dockerfile"
# unrelated changes must NOT trigger web
assert_match "$WEB_PATTERN" "apps/api/src/routes/health.routes.ts" false "web/unrelated-api"
assert_match "$WEB_PATTERN" "packages/db/src/schema/index.ts" false "web/unrelated-db"
assert_match "$WEB_PATTERN" "packages/sdk/src/types/liga.ts" false "web/unrelated-sdk"
assert_match "$WEB_PATTERN" "apps/api/Dockerfile" false "web/unrelated-api-dockerfile"

echo "== api pattern =="
assert_match "$API_PATTERN" "packages/contracts/src/games.ts" true "api/contracts"
assert_match "$API_PATTERN" "apps/api/src/routes/health.routes.ts" true "api/apps-api"
assert_match "$API_PATTERN" "packages/db/src/schema/index.ts" true "api/db"
assert_match "$API_PATTERN" "packages/sdk/src/types/liga.ts" true "api/sdk"
assert_match "$API_PATTERN" "packages/shared/src/constants.ts" true "api/shared"
# root-level build inputs must trigger api
assert_match "$API_PATTERN" "pnpm-lock.yaml" true "api/lockfile"
assert_match "$API_PATTERN" "turbo.json" true "api/turbo-json"
assert_match "$API_PATTERN" "apps/api/Dockerfile" true "api/own-dockerfile"
# unrelated changes must NOT trigger api
assert_match "$API_PATTERN" "packages/api-client/src/games.ts" false "api/unrelated-api-client"
assert_match "$API_PATTERN" "packages/ui/src/components/button.tsx" false "api/unrelated-ui"
assert_match "$API_PATTERN" "apps/web/src/app/page.tsx" false "api/unrelated-web"
assert_match "$API_PATTERN" "apps/web/Dockerfile" false "api/unrelated-web-dockerfile"

echo ""
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
