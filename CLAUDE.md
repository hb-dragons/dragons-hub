# CLAUDE.md - Agent Guidelines for dragons-all

## Project Overview

Basketball club management monorepo for the Dragons. Syncs data from the German Basketball Federation (Basketball-Bund) API into a local PostgreSQL database and provides an admin UI for monitoring sync operations.

## Monorepo Structure

```
apps/web          @dragons/web      Next.js 16 frontend (port 3000)
apps/api          @dragons/api      Hono REST API (port 3001)
apps/native       @dragons/native   Expo / React Native app (ships via EAS)
apps/pi           —                 Python payload for the Raspberry Pi scoreboard tap (not a pnpm workspace package; pytest + a CI job)
packages/ui       @dragons/ui       Shared shadcn/Radix UI components
packages/sdk      @dragons/sdk      Basketball-Bund SDK type definitions
packages/db       @dragons/db       Drizzle ORM schema & database client
packages/shared   @dragons/shared   Shared types, constants, and validation schemas
packages/contracts @dragons/contracts Zod request schemas — single source of truth for each API endpoint's request contract
packages/api-client @dragons/api-client Typed API client; infers request types from @dragons/contracts
```

**API request contracts:** Each API route group's request schema lives in `packages/contracts/src/<group>.ts` (zod-only, domain-noun-prefixed exports, re-exported by name from `index.ts`). Routes validate with `hono-openapi`'s `validator(target, schema, validationHook)` + `c.req.valid(...)` (the shared `validationHook` in `apps/api/src/middleware/validation.ts` emits the central `{error, code, details}` 400). `@dragons/api-client` infers its request types from the same schemas, and `*.contract.test.ts` files assert each client request body/query parses against its contract so client/server drift fails the build. When adding/changing a request contract, edit the schema in `@dragons/contracts` (never redeclare it in the route or the client).

Managed with pnpm workspaces + Turborepo. See `AGENTS.md` for detailed architecture.

## Commands

```bash
pnpm dev                          # Start all services (Turbopack + tsx watch)
pnpm build                        # Production build all packages
pnpm lint                         # Real ESLint across all packages (distinct from typecheck)
pnpm typecheck                    # tsc --noEmit across all packages
pnpm test                         # Run all tests
pnpm coverage                     # Run tests with per-package coverage enforcement
pnpm check:coverage-scripts       # Fail if a package with tests lacks a coverage script
pnpm check:design-tokens          # Fail on a Tailwind colour utility whose token does not exist

# Package-specific
pnpm --filter @dragons/api dev    # API only
pnpm --filter @dragons/web dev    # Web only
pnpm --filter @dragons/api test   # API tests only
pnpm --filter @dragons/native test  # Native (Expo) tests only
(cd apps/pi && pytest)            # Raspberry Pi payload tests (Python, not pnpm)

# Database (generate + migrate only — `drizzle-kit push` is disabled, see below)
pnpm --filter @dragons/db db:generate   # Generate Drizzle migrations
pnpm --filter @dragons/db db:migrate    # Run migrations
pnpm --filter @dragons/db db:studio     # Open Drizzle Studio

# Infrastructure
docker compose -f docker/docker-compose.dev.yml up -d   # Start Postgres + Redis
```

## Writing Style Rules (Anti-Slop)

CI runs `pnpm check:ai-slop` which scans `.md`, `.mdx`, `.txt` files for banned phrases. These phrases MUST NOT appear anywhere in prose:

- "delve into" <!-- ai-slop-ignore-line -->
- "game-changer" / "game changer" <!-- ai-slop-ignore-line -->
- "in today's fast-paced" <!-- ai-slop-ignore-line -->
- "leverage" <!-- ai-slop-ignore-line -->
- "seamlessly" / "seamless" <!-- ai-slop-ignore-line -->
- "unlock the power of" <!-- ai-slop-ignore-line -->
- "cutting-edge" <!-- ai-slop-ignore-line -->
- "robust" <!-- ai-slop-ignore-line -->
- "in conclusion" <!-- ai-slop-ignore-line -->
- "at the end of the day" <!-- ai-slop-ignore-line -->

Write direct, specific prose. Avoid filler words and vague adjectives. Add `ai-slop-ignore-line` as an inline comment only if a phrase is genuinely needed in context.

## Testing Requirements

- **Coverage is gated per testable package** (`api`, `web`, `shared`, `api-client`, `contracts`, `native`, `sdk`, `db`), each with its own thresholds in that package's `vitest.config.ts`. `apps/api` holds the high bar (90% branches, 95% functions/lines/statements); the other packages start at their measured floor and **ratchet up** over time — never lower a threshold. The one exception is *rescoping*: when `coverage.include` is widened so the gate measures more of a package, the floors are re-measured against the new scope and the comment above them records the date and reason (see `apps/native/vitest.config.ts`, rescoped 2026-07-26). That is a new measurement, not a lowered gate — do not "restore" the older, higher numbers. `sdk` and `db` deliberately scope `coverage.include` to their hand-written runtime modules (the SDK helpers; `db`'s client factory and `isLegacySnapshot`) — the rest of those packages is type definitions and declarative Drizzle schema, and `db`'s schema is exercised end to end by the API's PGlite suite. CI runs `pnpm check:coverage-scripts`, which fails if a package with `*.test.*` files has no `coverage` script, and also if a package ships TypeScript source but has no tests at all — unless it is listed with a recorded reason in `UNTESTED_PACKAGE_EXEMPTIONS` in `scripts/check-coverage-scripts.mjs`.
- **Every new feature or changed behavior MUST have corresponding tests**
- Tests live next to source files: `foo.ts` -> `foo.test.ts`
- Test framework: Vitest (v4) with `@hono/node-server` for API tests. `apps/native` uses a node-environment, logic-first vitest setup (react-native/expo are mocked per test; no RN component rendering).
- Run tests before committing: `pnpm --filter @dragons/api test` (or the relevant package)
- Coverage report: `pnpm --filter @dragons/api coverage`

## Linting

- `lint` and `typecheck` are **distinct** tasks. `pnpm lint` runs real ESLint (shared flat config in `eslint.config.base.mjs`); `pnpm typecheck` runs `tsc --noEmit`. Both run in CI.
- Bug-class rules are **errors** (CI fails): `no-floating-promises`, `no-misused-promises`, `no-unused-vars` (`^_`-prefixed args/vars are ignored), `consistent-type-imports`. `no-explicit-any` is a warning (and `any` is still disallowed by convention).

## Code Conventions

### TypeScript
- Strict mode enabled (`tsconfig.base.json`)
- Target: ES2022, Module: ESNext, `verbatimModuleSyntax` enabled
- No `any` types - use proper typing or `unknown`
- Use Zod for runtime validation at boundaries (API input, env vars)

### API (Hono)
- Routes go in `apps/api/src/routes/`
- Business logic goes in `apps/api/src/services/`
- Middleware in `apps/api/src/middleware/`
- Workers/queues in `apps/api/src/workers/`
- Config (env, database, redis) in `apps/api/src/config/`
- Env vars validated via Zod schema in `config/env.ts` - add new vars there

### Database (Drizzle)
- Schema files in `packages/db/src/schema/`
- After schema changes: run `db:generate` then `db:migrate`
- **`drizzle-kit push` is disabled.** It diffs the TS schema against the live DB and drops whatever the schema does not declare — including three indexes that exist only in hand-written SQL migrations and are invisible to drizzle-kit. The `db:push` script and `drizzle.config.ts` both refuse to run it. Migrations are the only schema-sync path. Details and the list of invisible indexes: `packages/db/drizzle/README.md`.
- Use `dataHash` columns for change detection during sync
- New tables use `serial` primary keys with separate `apiId`/`apiMatchId` etc. for external IDs. The exceptions are inherited: the four better-auth tables use text ids, `domainEvents` uses a text ULID, `broadcastConfigs` is keyed by `deviceId`, `taskAssignees` has a composite PK
- Unique constraints on external IDs to prevent duplicates
- `matchReferees` and `refereeGames` are soft-deleted: rows carry a `removedAt` tombstone and are never hard-deleted. **Every live-rows query on them needs `isNull(table.removedAt)`** — omitting it resurrects withdrawn assignments in lists, counts and eligibility checks. See AGENTS.md "Soft deletes (tombstones)"
- Table inventory lives in `AGENTS.md` and is enforced against the schema exports by `apps/api/src/test/docs-drift.test.ts` — add the row in the same commit as the table

### Frontend (Next.js)
- App Router with server components by default
- Client components marked with `"use client"` directive
- UI components imported from `@dragons/ui`
- API calls via `apps/web/src/lib/api.ts`
- Every route sits under a `[locale]` segment (next-intl); admin pages live in `app/[locale]/admin/`
- Dates and times go through `apps/web/src/lib/tz.ts` — never `toISOString().slice(0, 10)` or `new Date(day + "T00:00:00")`. Tests that touch them must force a non-Berlin `TZ`
- **Design System:** Read `packages/ui/DESIGN-SYSTEM.md` before building any UI

### SDK Types
- Type definitions in `packages/sdk/src/types/`
- Prefix SDK types with `Sdk` (e.g., `SdkLiga`, `SdkSpielplanMatch`)
- Type guards prefixed with `isSdk` (e.g., `isSdkLiga()`)
- Export everything from `packages/sdk/src/index.ts`

## File Naming

- All lowercase with hyphens: `sync-dashboard.tsx`, `health.routes.ts`
- Routes: `*.routes.ts`
- Tests: `*.test.ts` (co-located with source)
- Sync services: `*.sync.ts`
- Types: `types.ts` or `types/*.ts`

## Git & CI

- **Never add `Co-Authored-By`, `Signed-off-by`, or any other trailer that credits Claude/AI as a contributor.** Commits are authored solely by the human developer.
- CI runs on all PRs and pushes to main: lint + i18n check + typecheck + knip, test + coverage, build, `apps/pi` pytest, AI slop check, lockfile integrity, dependency review, dependency audit, secret scan. Full job list: `AGENTS.md` CI/CD table
- CD builds artifacts on pushes to main and creates releases on version tags
- Do not commit `.env` files, secrets, or credentials
- Do not commit `node_modules/`, `dist/`, `.next/`, `coverage/`

## Environment Variables

Required in `.env` (see `.env.example`):
```
DATABASE_URL=postgresql://dragons:dragons@localhost:5432/dragons
REDIS_URL=redis://localhost:6379
SDK_USERNAME=<basketball-bund credentials>
SDK_PASSWORD=<basketball-bund credentials>
BETTER_AUTH_SECRET=<random string, min 32 chars>
SCOREBOARD_INGEST_KEY=<random string, min 32 chars; bearer token the Pi includes on POST /api/scoreboard/ingest>
SCOREBOARD_DEVICE_ID=<Stramatel panel id from Panel2Net.id; ingest rejects mismatched headers>
```

Optional with defaults:
```
PORT=3001
NODE_ENV=development
RUN_MODE=both                     # api | worker | both — which halves of the process boot
TRUSTED_ORIGINS=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3001
LOG_LEVEL=info                    # Pino log level (fatal/error/warn/info/debug/trace)
SERVICE_NAME=api                  # log label; also the Cloud Run service name
WAHA_SESSION=default              # WAHA session name for whatsapp_group delivery
SYNC_RUN_RETENTION_DAYS=90        # sync_runs rows older than this are pruned
DOMAIN_EVENT_RETENTION_DAYS=365   # domain_events rows older than this are pruned
VERBOSE_ERRORS=false              # true returns error detail in API responses; keep false in production
ASSISTANT_ENABLED=false           # set true to enable the game rescheduling AI copilot
ASSISTANT_MODEL=gemini-2.5-flash  # Gemini model ID used by the assistant
CHATBOT_ENABLED=false             # set true to enable the members-only club Q&A assistant; requires GOOGLE_GENERATIVE_AI_API_KEY
CHATBOT_MODEL=gemini-2.5-flash    # AI SDK model ID for the club Q&A assistant
```

Optional with no default — the dependent feature stays off when unset:
```
GCS_BUCKET_NAME=<bucket for social post assets; the social routes need it>
GCS_PROJECT_ID=<GCP project owning that bucket>
SERVICE_VERSION=<falls back to K_REVISION, which Cloud Run sets, then "unknown">
GCP_PROJECT_ID=<required for Cloud Logging → Cloud Trace correlation>
WAHA_BASE_URL=<WhatsApp HTTP API base URL; whatsapp_group delivery is inert without it>
REFEREE_SDK_USERNAME=<separate federation account for referee assignment>
REFEREE_SDK_PASSWORD=<separate federation account for referee assignment>
EXPO_ACCESS_TOKEN=<enables the authenticated Expo Push send tier: higher rate limits + better receipt SLA>
EXPO_PROJECT_ID=<EAS project id; validated as a non-empty string at boot and not read anywhere else>
GOOGLE_GENERATIVE_AI_API_KEY=<google ai studio key; required when ASSISTANT_ENABLED or CHATBOT_ENABLED is true>
MCP_TOKEN=<random string min 32 chars; bearer token for the /mcp endpoint>
```

There are no `SMTP_*` vars, and `email` is not a channel type. Both were removed
once it turned out `email` was offerable with no adapter behind it, so an admin
could create a channel config whose every notification was dropped. A channel
type belongs in `CHANNEL_TYPES` (`packages/shared/src/channel-configs.ts`) only
once `DISPATCHABLE_CHANNEL_TYPES` in
`apps/api/src/services/notifications/notification-pipeline.ts` can deliver it;
that record is exhaustive over `ChannelType`, so the two cannot drift apart
without a compile error. The vars come back with the adapter.

Build-time client variables. These never reach `config/env.ts` — Next.js and
Expo inline them into their bundles, so changing one needs a rebuild:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SCOREBOARD_DEVICE_ID=<must match SCOREBOARD_DEVICE_ID>
NEXT_PUBLIC_ASSISTANT_ENABLED=false # web: show the reschedule copilot entry point on match detail
NEXT_PUBLIC_CHATBOT_ENABLED=false # web: mount the club assistant widget on public pages
EXPO_PUBLIC_CHATBOT_ENABLED=false # native: show the club assistant entry point
```

### Production deployment plumbing

`SCOREBOARD_DEVICE_ID` flows into two places that must stay in sync:
- **API + Worker (Cloud Run runtime):** declared in `infra/environments/production/variables.tf` as `scoreboard_device_id`; threaded into the API/Worker `env_vars` blocks in `main.tf`.
- **Web (build-time):** Next.js inlines `NEXT_PUBLIC_*` into the client bundle, so `NEXT_PUBLIC_SCOREBOARD_DEVICE_ID` is passed as a Docker build-arg in `.github/workflows/deploy.yml`, sourced from the GitHub repository variable `vars.SCOREBOARD_DEVICE_ID`.

`SCOREBOARD_INGEST_KEY` is generated by `random_password.scoreboard_ingest_key` in TF, stored in Secret Manager as `scoreboard-ingest-key-production`, and mounted into the API + Worker via `secrets`. Read it post-`tofu apply` to configure the Raspberry Pi sender.

The chatbot/assistant/MCP feature vars are threaded from GitHub through TF (set the corresponding GitHub Actions secret/variable, then `opentofu.yml` passes it as `TF_VAR_*`):
- **Feature flags** `CHATBOT_ENABLED` / `ASSISTANT_ENABLED`: GitHub repository variables → `TF_VAR_chatbot_enabled` / `TF_VAR_assistant_enabled` (empty `|| 'false'` fallback) → API/Worker `env_vars`. Each also feeds a web build-arg in `deploy.yml` from the same variable — `NEXT_PUBLIC_CHATBOT_ENABLED` and `NEXT_PUBLIC_ASSISTANT_ENABLED` — so the frontend entry points and the backend stay in sync from one source (the web `ARG`/`ENV` pair lives in `apps/web/Dockerfile`). Models (`CHATBOT_MODEL` / `ASSISTANT_MODEL`) use their TF defaults; not passed from the workflow.
- **Secrets** `GOOGLE_GENERATIVE_AI_API_KEY` (required when either flag is `true` — the API env schema rejects boot otherwise) and `MCP_TOKEN`: GitHub Actions secrets → `TF_VAR_*` → Secret Manager (`google-generative-ai-api-key-production`, `mcp-token-production`) → mounted via `secrets`. The Google key is mounted on both API + Worker (both run the same env schema); `MCP_TOKEN` only on the API, which serves `/mcp`.
- **Native** `EXPO_PUBLIC_CHATBOT_ENABLED`: set per build profile in `apps/native/eas.json` (native ships via EAS, not GitHub Actions).

Notification delivery credentials follow the same route. Both are optional, and both are wired into the API *and* the Worker: the Worker runs the event worker (and the push-receipt worker), while the API dispatches through the same pipeline from the admin test-send and "retry failed notification" routes.
- **`WAHA_BASE_URL` / `WAHA_SESSION`** (WhatsApp group delivery): GitHub repository *variables* → `TF_VAR_waha_base_url` / `TF_VAR_waha_session` → API/Worker `env_vars`. Not credentials — the adapter sends no auth header — so they do not belong in Secret Manager. `main.tf` omits both keys entirely when `waha_base_url` is `""`, because `env.ts` validates `WAHA_BASE_URL` as a URL and `.optional()` does not accept an empty string, so passing `""` through would fail the service at boot instead of just leaving the channel off.
- **`EXPO_ACCESS_TOKEN`** (authenticated Expo Push tier): GitHub Actions *secret* → `TF_VAR_expo_access_token` → Secret Manager (`expo-access-token-production`) → mounted on API + Worker via `secrets`. When the variable is `""` the secret, its version and both mounts are skipped (Secret Manager rejects an empty payload) and push runs on the unauthenticated tier.

Note: Club and league tracking configuration is managed via the admin UI (`/admin/settings`) and stored in the `app_settings` database table.

## When Changing Things

1. **New API endpoint**: Add route in `routes/`, add tests, add the row to `AGENTS.md`'s endpoint tables — `apps/api/src/test/docs-drift.test.ts` compares them against the Hono route tree in both directions and fails the build otherwise
2. **New DB table**: Add schema in `packages/db/src/schema/`, export from index, run `db:generate`, add the row to `AGENTS.md`'s data model table (enforced by `docs-drift.test.ts`)
3. **New sync entity**: Add `*.sync.ts` in `services/sync/`, then call it from `fullSync()` in `apps/api/src/services/sync/index.ts` (there is no orchestrator class — the pipeline is a module of free functions), add tests, add the stage to `AGENTS.md`'s Execution Flow block — `docs-drift.test.ts` derives the stage list from `fullSync` and checks the block names every stage **in call order**
4. **New UI component**: Add to `packages/ui/src/components/`, export from index
5. **New env var**: Add to Zod schema in `config/env.ts`, add to `.env.example`, document here. All three must agree — `docs-drift.test.ts` checks the schema against both files in both directions, so a var added to the schema alone, or left in a file after removal from the schema, fails the build
6. **Any change**: Write/update tests to maintain coverage above thresholds
