# Single source of truth for deploy.yml's "determine-changes" path filters.
# Sourced by the workflow itself and by change-patterns.test.sh so the two
# can never drift apart (see GitHub issue #98).
#
# NOTE: keep in sync with the "Root-level build inputs" acceptance criterion —
# changes to the lockfile, turbo.json, or a service's own Dockerfile must
# trigger that service's deploy even though they sit outside apps/ or
# packages/.

WEB_PATTERN='^(apps/web/|packages/ui/|packages/shared/|packages/contracts/|packages/api-client/|pnpm-lock\.yaml$|turbo\.json$|apps/web/Dockerfile$)'
API_PATTERN='^(apps/api/|packages/db/|packages/sdk/|packages/shared/|packages/contracts/|pnpm-lock\.yaml$|turbo\.json$|apps/api/Dockerfile$)'
