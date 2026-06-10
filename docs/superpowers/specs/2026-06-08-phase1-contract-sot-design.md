# Phase 1 — Contract single source of truth (design)

**Date:** 2026-06-08
**Status:** Design approved, pending spec review
**Source:** `docs/2026-06-08-architecture-audit.md` — "Recommended sequencing → Phase 1"
**Root cause attacked:** #1 — *Hand-maintained parallel contracts with no single source of truth* (the master problem).

## Problem

Every typed boundary in the monorepo is duplicated by hand and the copies have already
drifted into shipped bugs. A request body is declared in the API's zod schema, again as an
`@dragons/api-client` interface, again as a `@dragons/shared` response type — with nothing
forcing them to agree. The validation stack that would centralize this is declared but never
wired:

- `@hono/standard-validator@^0.2.2` is in `apps/api/package.json` but imported nowhere in
  `src` (no `validator`/`sValidator`/`zValidator`).
- `hono-openapi@^1.3.0` is installed and `describeRoute` is used, but no route passes a
  request or response schema through `resolver()`. The only `content:` entries in the whole
  route tree are two *response* media types (`image/webp`, `text/calendar`). So
  `/openapi.json` and the Scalar `/docs` are prose-only and cannot generate a client.
- Routes hand-roll `schema.parse(c.req.json())` and api-client re-declares the body shapes
  (`UpdateColumnBody`, `MoveTaskBody`, …) with zero compile-time link to the API schema.

This is the structural reason bug #3 (native column reorder 400 — api-client sent `{order}`,
API required `{columns}`) shipped, and why it would recur on the next endpoint. Phase 0
patched the symptom; Phase 1 removes the class of bug.

## Decisions made during brainstorming

1. **Contract direction: B — share zod, keep the client.** Server-side zod schemas become
   the single source of truth; api-client consumes `z.infer` types instead of re-declaring
   them; a contract test guards the link. We rejected (A) generating the client from OpenAPI
   (adds a codegen pipeline and replaces the hand-written endpoint helpers native depends on)
   and (C) Hono RPC `hc` (couples api-client to Hono and discards the framework-agnostic
   injectable-fetch/auth design the audit explicitly praised as "the right shape for two
   clients"). Wiring `validator()`/`resolver()` is still part of B — it makes the OpenAPI
   spec real as a by-product, without the client *depending* on codegen.

2. **Schema home: new `@dragons/contracts` package** (zod-only runtime dep). The API imports
   it for validation; api-client imports it for `z.infer` types. A package cannot reach into
   an app, so the schemas (today in `apps/api/src/routes/**/*.schemas.ts`) must move to a
   shared package regardless. We chose a clean new package over a slice of `@dragons/shared`
   because `@dragons/shared` is the flagged junk-drawer (Phase 3 splits it) and adding the
   canonical contract source to it would deepen that problem and keep dragging
   `react`/`better-auth` into every schema consumer.

3. **Scope: full API coverage as the goal, decomposed into incremental tasks — board first
   as the tracer, one route group per task.** Not a single big-bang migration.

4. **Response schemas: test-time only.** Request validation runs at runtime; response schemas
   are defined in contracts and referenced by `resolver()` for the spec, but asserted only in
   tests (handler-output fixture parses against the schema), to avoid hot-path cost.

5. **Migration order: client-facing groups first, server-only after.** Client-facing groups
   (an api-client endpoint exists) get the full `z.infer` rewire and kill real cross-client
   drift; server-only groups get schema-move + `validator()`/`resolver()` so the type is
   exportable when web/native later need it.

## Architecture — the contract loop

For each endpoint, one schema object drives four consumers:

```
@dragons/contracts                  ← canonical: columnReorderBodySchema + z.infer type
        │
        ├── apps/api route           validator("json", schema)  → runtime request validation
        │                            resolver(schema) in describeRoute → real OpenAPI spec
        │
        ├── packages/api-client      import type ColumnReorderBody = z.infer<…>
        │                            (replaces the hand-declared interface)
        │
        └── contract test            api-client request-body fixture .parse()s against schema
                                     → fails the build the moment client and server disagree
```

Because `validator()` and `resolver()` receive the *same* schema object, request validation
and the documented contract cannot diverge. Because api-client imports the inferred type, a
server schema change surfaces as a client typecheck failure rather than a runtime 400 on one
client. The contract test is the runtime backstop that would have caught bug #3.

### Package shape — `@dragons/contracts`

- Runtime dependency: `zod` only. No `react`, no `better-auth`, no `@dragons/sdk`.
- Exports per group: the request schemas (existing names kept, e.g. `columnReorderBodySchema`)
  plus `export type ColumnReorderBody = z.infer<typeof columnReorderBodySchema>`, and response
  schemas where defined.
- Extends `tsconfig.base.json` (strict, `verbatimModuleSyntax`) like every other package.
  Consumers use `import { schema }` for the value and `import type { Body }` for the type.
- Has a `coverage` script with thresholds (see Coverage).

### Validation error envelope

`validator()` changes how a 400 is produced. Its failure path is routed through the existing
central `errorHandler` so every validation rejection keeps one `{error, code, details}`
shape. This is the *narrow* slice of the audit's "inconsistent error envelopes" finding that
Phase 1 unavoidably touches — the broader error-class unification (typed `DomainError` base,
removing `status as never`) stays in Phase 3.

### Coverage

`@dragons/contracts` and the touched `packages/api-client` get a `coverage` script + threshold
so the new shared contract code is gated. This addresses root cause #4 (shared code both
clients depend on currently has no coverage gate) for exactly the code Phase 1 adds — it is
*not* the repo-wide coverage rollout (that is Phase 2). The contract tests supply most of the
coverage for the contracts package.

## Task breakdown (incremental, board first)

### Task 0 — Foundation, proven on the board slice (the tracer)

Establishes every mechanism by carrying one real, bug-prone group end-to-end:

- Scaffold `@dragons/contracts` (package.json, tsconfig extending base, vitest config with
  coverage, index barrel, workspace wiring, `lint`/`typecheck`/`test`/`coverage` scripts).
- Move `apps/api/src/routes/admin/board.schemas.ts` into `@dragons/contracts`; add `z.infer`
  type exports.
- Wire `validator("json"/"param"/"query", schema)` on `board.routes.ts`; replace the manual
  `schema.parse(...)` calls.
- Pass the same schemas into `describeRoute` via `resolver()` for request and response.
- Route the validator failure path through the central `errorHandler` (envelope consistency).
- Rewire api-client `admin-board.ts` to import the `z.infer` types instead of re-declaring
  `UpdateColumnBody`/`MoveTaskBody`/reorder bodies. (Confirm/resolve the `UpdateColumnBody`
  `position` drift noted in the audit while here.)
- Build the contract-test harness and write the board contract test.
- Add coverage scripts/thresholds to `@dragons/contracts` and `api-client`.
- Green: `pnpm --filter @dragons/api test` (2857+ stays green), `pnpm --filter @dragons/api
  typecheck`, api-client tests, contracts tests.

### Client-facing groups (full `z.infer` rewire — highest drift-killing value)

One task each. An api-client endpoint module exists, so both server schema and client type
move:

- **`public/*`** → api-client `public.ts` (`PublicTeam`, match-list, standings shapes).
- **`referee/*`** assignment + games → api-client `referee.ts`.
- **`device`** → api-client `devices.ts`.

### Server-only groups (schema-move + `validator()`/`resolver()`; no client rewire yet)

One task each (or small sensible batches of trivially-related ones). These already have a
`.schemas.ts`:

`match`, `booking`, `channel-config`, `event`, `notification`, `referee-history`,
`referee-rules`, `referee`, `social`, `sync`, `task`, `team`, `venue`, `watch-rule`.

These have **inline `z.object`** today — first extract to a schema in contracts, then migrate:

`league`, `settings`, `user`, `broadcast`, `scoreboard`, `notification-test`,
`referee-eligible-games`, `standings`.

Each task: move/extract schema → `validator()`/`resolver()` → rewire client if applicable →
contract test → green.

## Out of scope (explicitly deferred)

- **Web's `fetchAPI` → api-client migration** (~74 files) — Phase 3. Phase 1 ensures that
  when it happens, web migrates onto a *settled* contract, not a drifting one.
- **Broader error-class unification** — Phase 3 (only the validator envelope is touched here).
- **Audit #7 — `pnpm.overrides` move to `pnpm-workspace.yaml`** — standalone task on `main`,
  deliberately separate from any feature branch (it re-resolves the lockfile `main` reverted).

## Verification (run in the worktree)

```bash
cd ~/.config/superpowers/worktrees/dragons-hub/fix-phase0
pnpm --filter @dragons/api test          # full API suite (2857+, must stay green)
pnpm --filter @dragons/api typecheck     # the real check
pnpm --filter @dragons/contracts test    # new package
pnpm --filter @dragons/api-client test   # client + contract tests
```

The `[WARN] "pnpm" field … ignored` line is expected — that is deferred audit #7.

## Success criteria

- `@dragons/contracts` exists, zod-only runtime dep, and is the sole declaration of every
  migrated endpoint's request body shape.
- api-client declares zero request-body interfaces for migrated endpoints — all are
  `z.infer` of a contracts schema.
- A contract test fails if any api-client request body diverges from its API schema
  (regression guard for the bug-#3 class).
- Migrated routes validate via `validator()` and their request/response schemas appear in
  `/openapi.json`.
- Board endpoints (the tracer) are fully migrated and green; the pattern for the remaining
  groups is documented and mechanical.
