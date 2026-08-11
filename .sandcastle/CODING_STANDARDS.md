# Coding Standards

`CLAUDE.md` at the repo root is the authoritative version of these rules; `AGENTS.md` holds the architecture detail. This file is the review checklist distilled from both.

## Non-negotiables

- No `any` — proper types or `unknown`. Strict mode, `verbatimModuleSyntax`, ES2022.
- Zod validation at boundaries. API request schemas live in `packages/contracts` only — never redeclared in a route or the client.
- Bug-class ESLint rules are errors: `no-floating-promises`, `no-misused-promises`, `no-unused-vars`, `consistent-type-imports`.
- File naming: all lowercase with hyphens (`sync-dashboard.tsx`, `health.routes.ts`).

## Testing

- Every new feature or changed behavior has tests, co-located (`foo.ts` → `foo.test.ts`).
- Coverage thresholds ratchet per package and are never lowered — new code must keep its package's gate green.
- API integration tests run against real PGlite via `setupTestDb` — never mock `drizzle-orm` or `@dragons/db/schema`.
- A skipped test must cite an issue (`#123`); CI rejects bare skips.
- Never pair Testing Library's `waitFor` with `vi.useFakeTimers()` — advance the clock inside `act` instead.

## Domain gotchas

- `matchReferees` / `refereeGames` are soft-deleted: every live-rows query needs `isNull(table.removedAt)`.
- Dates and times go through `packages/shared/src/kickoff.ts` — never `toISOString().slice(0, 10)` or `new Date(day + "T00:00:00")`. Tests touching them force a non-Berlin `TZ`.
- Web routes sit under `[locale]`; user-facing strings need both `en.json` and `de.json`.
- UI follows `packages/ui/DESIGN-SYSTEM.md`; Tailwind colour utilities must use existing design tokens.
- Native (`apps/native`): node-environment vitest, logic-first — no RN component rendering; react-native/expo are mocked per test.

## Docs drift (CI-enforced)

- New API endpoint, DB table, or sync stage → the matching `AGENTS.md` table/block row in the same commit (`docs-drift.test.ts` fails otherwise).
- New env var → `config/env.ts` schema + `.env.example` + `CLAUDE.md`, all three.
- Markdown prose is scanned for banned filler phrases (`check:ai-slop`) — write direct, specific prose.

## Commits

- Conventional style: `type(scope): summary`, referencing the issue.
- Never any `Co-Authored-By` / AI-crediting trailer.
