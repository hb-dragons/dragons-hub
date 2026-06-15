# CLAUDE.md - Agent Guidelines for dragons-all

## Project Overview

Basketball club management monorepo for the Dragons. Syncs data from the German Basketball Federation (Basketball-Bund) API into a local PostgreSQL database and provides an admin UI for monitoring sync operations.

## Monorepo Structure

```
apps/web          @dragons/web      Next.js 16 frontend (port 3000)
apps/api          @dragons/api      Hono REST API (port 3001)
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

# Package-specific
pnpm --filter @dragons/api dev    # API only
pnpm --filter @dragons/web dev    # Web only
pnpm --filter @dragons/api test   # API tests only
pnpm --filter @dragons/native test  # Native (Expo) tests only

# Database
pnpm --filter @dragons/db db:generate   # Generate Drizzle migrations
pnpm --filter @dragons/db db:migrate    # Run migrations
pnpm --filter @dragons/db db:push       # Push schema to DB
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

- **Coverage is gated per testable package** (`api`, `web`, `shared`, `api-client`, `contracts`, `native`), each with its own thresholds in that package's `vitest.config.ts`. `apps/api` holds the high bar (90% branches, 95% functions/lines/statements); the other packages start at their measured floor and **ratchet up** over time — never lower a threshold. CI runs `pnpm check:coverage-scripts`, which fails if a package with `*.test.*` files has no `coverage` script.
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
- Use `dataHash` columns for change detection during sync
- All tables use `serial` primary keys with separate `apiId`/`apiMatchId` etc. for external IDs
- Unique constraints on external IDs to prevent duplicates

### Frontend (Next.js)
- App Router with server components by default
- Client components marked with `"use client"` directive
- UI components imported from `@dragons/ui`
- API calls via `apps/web/src/lib/api.ts`
- Admin pages under `app/admin/`
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
- CI runs on all PRs and pushes to main: lint, typecheck, test, coverage, build, AI slop check, dependency audit, secret scan
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
TRUSTED_ORIGINS=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SCOREBOARD_DEVICE_ID=<must match SCOREBOARD_DEVICE_ID; baked into the web bundle at build time>
BETTER_AUTH_URL=http://localhost:3001
LOG_LEVEL=info                    # Pino log level (fatal/error/warn/info/debug/trace)
REFEREE_SDK_USERNAME=<separate federation account for referee assignment>
REFEREE_SDK_PASSWORD=<separate federation account for referee assignment>
EXPO_ACCESS_TOKEN=<optional — enables authenticated Expo Push send tier, higher rate limits + better receipt SLA>
EXPO_PROJECT_ID=<optional — validates EAS project ID match between server and native; surfaces mismatch early>
ASSISTANT_ENABLED=false           # set true to enable the game rescheduling AI copilot
ASSISTANT_MODEL=gemini-2.5-flash  # Gemini model ID used by the assistant
GOOGLE_GENERATIVE_AI_API_KEY=<google ai studio key; required when ASSISTANT_ENABLED=true>
MCP_TOKEN=<random string min 32 chars; bearer token for the /mcp endpoint>
CHATBOT_ENABLED=false             # set true to enable the members-only club Q&A assistant; requires GOOGLE_GENERATIVE_AI_API_KEY
CHATBOT_MODEL=gemini-2.5-flash    # AI SDK model ID for the club Q&A assistant
NEXT_PUBLIC_CHATBOT_ENABLED=false # web: mount the club assistant widget on public pages; baked into the web bundle at build time
EXPO_PUBLIC_CHATBOT_ENABLED=false # native: show the club assistant entry point; baked into the native bundle at build time
```

### Production deployment plumbing

`SCOREBOARD_DEVICE_ID` flows into two places that must stay in sync:
- **API + Worker (Cloud Run runtime):** declared in `infra/environments/production/variables.tf` as `scoreboard_device_id`; threaded into the API/Worker `env_vars` blocks in `main.tf`.
- **Web (build-time):** Next.js inlines `NEXT_PUBLIC_*` into the client bundle, so `NEXT_PUBLIC_SCOREBOARD_DEVICE_ID` is passed as a Docker build-arg in `.github/workflows/deploy.yml`, sourced from the GitHub repository variable `vars.SCOREBOARD_DEVICE_ID`.

`SCOREBOARD_INGEST_KEY` is generated by `random_password.scoreboard_ingest_key` in TF, stored in Secret Manager as `scoreboard-ingest-key-production`, and mounted into the API + Worker via `secrets`. Read it post-`tofu apply` to configure the Raspberry Pi sender.

Note: Club and league tracking configuration is managed via the admin UI (`/admin/settings`) and stored in the `app_settings` database table.

## When Changing Things

1. **New API endpoint**: Add route in `routes/`, add tests, update `AGENTS.md` endpoint list
2. **New DB table**: Add schema in `packages/db/src/schema/`, export from index, run `db:generate`, update `AGENTS.md` data model
3. **New sync entity**: Add `*.sync.ts` in `services/sync/`, wire into `SyncOrchestrator`, add tests, update `AGENTS.md`
4. **New UI component**: Add to `packages/ui/src/components/`, export from index
5. **New env var**: Add to Zod schema in `config/env.ts`, add to `.env.example`, document here
6. **Any change**: Write/update tests to maintain coverage above thresholds
