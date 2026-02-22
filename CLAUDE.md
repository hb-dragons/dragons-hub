# CLAUDE.md - Agent Guidelines for dragons-all

## Project Overview

Basketball club management monorepo for the Dragons. Syncs data from the German Basketball Federation (Basketball-Bund) API into a local PostgreSQL database and provides an admin UI for monitoring sync operations.

## Monorepo Structure

```
apps/web        @dragons/web    Next.js 16 frontend (port 3000)
apps/api        @dragons/api    Hono REST API (port 3001)
packages/ui     @dragons/ui     Shared shadcn/Radix UI components
packages/sdk    @dragons/sdk    Basketball-Bund SDK type definitions
packages/db     @dragons/db     Drizzle ORM schema & database client
```

Managed with pnpm workspaces + Turborepo. See `AGENTS.md` for detailed architecture.

## Commands

```bash
pnpm dev                          # Start all services (Turbopack + tsx watch)
pnpm build                        # Production build all packages
pnpm lint                         # ESLint + tsc --noEmit across all packages
pnpm typecheck                    # TypeScript checks across all packages
pnpm test                         # Run all tests
pnpm coverage                     # Run tests with coverage enforcement

# Package-specific
pnpm --filter @dragons/api dev    # API only
pnpm --filter @dragons/web dev    # Web only
pnpm --filter @dragons/api test   # API tests only

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

- **Coverage thresholds**: 100% branches, functions, lines, statements (enforced in `apps/api/vitest.config.ts`)
- **Every new feature or changed behavior MUST have corresponding tests**
- Tests live next to source files: `foo.ts` -> `foo.test.ts`
- Test framework: Vitest (v4) with `@hono/node-server` for API tests
- Run tests before committing: `pnpm --filter @dragons/api test`
- Coverage report: `pnpm --filter @dragons/api coverage`

## Code Conventions

### TypeScript
- Strict mode enabled (`tsconfig.base.json`)
- Target: ES2022, Module: ESNext
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
```

Optional with defaults:
```
PORT=3001
NODE_ENV=development
TRUSTED_ORIGINS=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
BETTER_AUTH_URL=http://localhost:3001
```

Note: Club and league tracking configuration is managed via the admin UI (`/admin/settings`) and stored in the `app_settings` database table.

## When Changing Things

1. **New API endpoint**: Add route in `routes/`, add tests, update `AGENTS.md` endpoint list
2. **New DB table**: Add schema in `packages/db/src/schema/`, export from index, run `db:generate`, update `AGENTS.md` data model
3. **New sync entity**: Add `*.sync.ts` in `services/sync/`, wire into `SyncOrchestrator`, add tests, update `AGENTS.md`
4. **New UI component**: Add to `packages/ui/src/components/`, export from index
5. **New env var**: Add to Zod schema in `config/env.ts`, add to `.env.example`, document here
6. **Any change**: Write/update tests to maintain 100% coverage
