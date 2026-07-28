# Route-layer sweep: contracts validation (#75) + service extraction (#52)

**Issues:** [#75](https://github.com/hb-dragons/dragons-hub/issues/75),
[#52](https://github.com/hb-dragons/dragons-hub/issues/52) (both part of #44)
**Date:** 2026-07-28
**Scope:** `apps/api` route + service layers, `packages/contracts`, and one
component in `apps/web`. Builds directly on the `AppError` primitive introduced
by [#56](https://github.com/hb-dragons/dragons-hub/issues/56)
(`docs/superpowers/specs/2026-07-28-app-error-central-mapping-design.md`).

---

## Problem

Two tickets describe one problem from two sides.

**#75:** route files hand-roll id, query and body validation, then emit ad-hoc
400/404 bodies that lack the `code`/`details` the rest of the API returns.
Fourteen route files call no `validator()` at all.

**#52:** ~10 route files embed business logic and direct database access,
including a `getDb().transaction()` that writes `domainEvents` and
`notificationLog`. Eleven route files import `drizzle-orm` or
`config/database`.

Six files appear on both lists. Doing the tickets separately would touch each of
those twice, and in the clearest cases — `referee/assignment.routes.ts` — the
`Number(c.req.param(...))` guard and the ownership lookup it protects are the
same thirty lines. The user decided to run them together, per route group.

### Why not also #76

`as` laundering (#76) lives mostly in `services/sync/` and
`services/notifications/`, which barely overlap these route files. Folding it in
would add unrelated churn to every diff. It stays a separate pass afterwards.

---

## Scope

### In

Every route file on either ticket's checklist, plus two additions found while
measuring:

**Half-validated queries.** `admin/sync.routes.ts:99-108` and
`public/match.routes.ts:33-37` already call `validator("query", ...)`, then read
one further parameter through `c.req.query()` outside the validated schema. Sync
silently clamps a bad `limit` to 100 rather than rejecting it; match coerces
`opponentApiId` with a bare `Number()`. Same defect class, already inside the
blast radius.

**`public/assets.routes.ts`.** On neither list. Its router pattern
`:id{[0-9]+\.webp}` already performs the real validation, so no `validator()`
swap is warranted — it needs only `code` on its 400 and 404 bodies, to satisfy
the envelope decision below.

### Out

| File | Why |
|---|---|
| `health.routes.ts` | Takes no input; its direct database access *is* the liveness probe |
| `admin/standings.routes.ts`, `public/standings.routes.ts`, `public/home.routes.ts` | Take no input at all |
| `api/scoreboard.routes.ts` | Raw hex body plus a device header — bespoke by nature, and already has `bodyLimit` |
| `mcp.routes.ts` | MCP JSON-RPC envelope, owned by the SDK |

### Correction to #75's checklist

The ticket says `z.enum(EVENT_TYPES)`. `EVENT_TYPES` is an object map; the
readonly array `z.enum()` needs is `EVENT_TYPE_VALUES`
(`packages/shared/src/domain-events.ts:78`).

---

## Decisions

### D1 — The referee-identity check pushes into each existing service

Three routes perform the same lookup (load the referee row, reject not-found and
not-own-club) and map it to three different statuses:

| Route | Not found | Not own-club |
|---|---|---|
| `referee/assignment.routes.ts` | 403 `FORBIDDEN` | 403 `NOT_OWN_CLUB` |
| `admin/referee-rules.routes.ts` | 404 `NOT_FOUND` | 400 `NOT_OWN_CLUB` |
| `admin/referee-eligible-games.routes.ts` | 404 `NOT_FOUND` | — |

This is the divergence `AGENTS.md` already documents: `NOT_OWN_CLUB` is 403 from
`AssignmentError` (the caller may not act) and 400 from `RefereeSettingsError`
(the body names a referee who does not qualify).

`assignReferee`, `getRulesForReferee` and `getEligibleOpenGames` each take the
referee id, perform their own lookup, and throw their own existing error class.
No shared identity module.

The alternative — one `referee-identity.service.ts` throwing a
`RefereeIdentityError` with a single code→status table — is fully DRY but forces
one status per code, changing the public contract of two of the three routes. It
contradicts the documented rule against hoisting these tables. The cost of D1 is
roughly five duplicated lines of SQL in three services; that is the cheaper side.

### D2 — Non-validation error bodies are normalised to `{error, code}`

Every non-validation error body in a touched route gains a `code`. Two
consequences:

- `notification-test.routes.ts` returns `{error: "no_devices", message}` with no
  `code`, so `APIError.code` resolves to its `"UNKNOWN_ERROR"` fallback
  (`packages/api-client/src/client.ts:172`) and
  `apps/web/src/components/admin/push-test-card.tsx:85` matches the *message*
  with `/no_devices/i`. That body gains `code: "NO_DEVICES"` and the component
  switches to `err.code === "NO_DEVICES"`.
- The 404s that currently return a bare `{error}` gain their `code`.

This is the only client-side change in the sweep. The web strings
"Referee not found" and "Team not found" are i18n messages, not read from API
responses.

### D3 — Malformed JSON joins the same envelope

Hono's core validator (`hono/dist/validator/validator.js`) throws
`HTTPException(400, "Malformed JSON in request body")` before
`@hono/standard-validator` ever runs, so the shared `validationHook` never sees
it and `middleware/error.ts` labels it `code: "HTTP_ERROR"`. The routes being
replaced return `VALIDATION_ERROR` for the same input.

Two shapes for "your request was malformed" is what #75 exists to remove, so
`errorHandler` maps `HTTPException` status 400 to `VALIDATION_ERROR` — one line
added to the existing ternary chain.

### D4 — `triggerRefereeGamesSync` keeps returning `null`

`admin/settings.routes.ts:137-141` turns a `null` return into a 409 that lacks a
`code`. Converting the service to throw `SyncAlreadyQueuedError` would be
tidier at the route, but `workers/index.ts:115` calls the same function and
ignores its result, where "already queued" is a normal outcome — throwing would
surface it as an unhandled rejection in the worker. The route's 409 body simply
gains `code: "SYNC_ALREADY_QUEUED"`.

### D5 — Service placement

Extend an existing service when its name still describes the addition; otherwise
add a new leaf module. `services/public/team-stats.service.ts` does not describe
"list all teams", so that gets its own module.

---

## Mechanics verified before committing to the design

**Optional bodies survive the swap.** Hono's validator sets `value = {}` when
Content-Type is absent or not JSON, rather than failing. `refereeClaimBodySchema`
has only optional fields, so `{}` parses, and
`packages/api-client/src/endpoints/referee.ts:62` already sends `params ?? {}`.
The claim route's "empty body means no slot preference" behaviour is preserved.

**No client depends on the test-push 429 body.** Nothing in `apps/web`,
`apps/native` or `packages/api-client` reads `retryAfter` or `rate_limited`, so
that route can move onto the shared `rateLimit` middleware.

**No client sends `limit` to `/admin/sync/jobs`,** so tightening it from a silent
clamp to a 400 breaks nothing. `opponentApiId` is only ever sent through the
typed client as a `number`, so bounding it is equally safe.

---

## Slices

One branch, one commit per slice, every file touched exactly once.

| # | Slice | Files |
|---|---|---|
| 0 | contracts warm-up | `packages/contracts/src/event.ts` |
| 1 | referee self-service | `referee/assignment.routes.ts` |
| 2 | referee admin | `admin/referee.routes.ts`, `admin/referee-rules.routes.ts`, `admin/referee-eligible-games.routes.ts` |
| 3 | public | `public/team`, `public/match`, `public/scoreboard`, `public/broadcast`, `public/assets` |
| 4 | admin misc | `admin/user`, `admin/scoreboard`, `admin/broadcast`, `admin/sync`, `admin/settings` |
| 5 | device | `device.routes.ts` |
| 6 | notification-test | `admin/notification-test.routes.ts` |
| 7 | assistant | `admin/assistant.routes.ts` |

**Slice 0** is independent of every route: `triggerEventSchema.type` becomes
`z.enum(EVENT_TYPE_VALUES)`, and the event-list `from`/`to` become `dateSchema`
— the latter fixes a live 500, since `new Date("garbage").toISOString()` throws.

**Slice 1** is the smallest file where both concerns are literally the same
lines, so it sets the pattern the rest follow.

**Slice 6** is the largest (236 LoC, including the transaction) and is
deliberately built on the pattern slices 1–5 establish. It may split into more
than one commit if a seam presents itself once the extraction is under way — the
constraint is that the `domainEvents` + `notificationLog` transaction stays
whole within a single commit.

**Slice 7** turns out to be mechanical rather than feature work: `bodyLimit` is
already used in `mcp.routes.ts` and `api/scoreboard.routes.ts`, `rateLimit`
exists, and `qa.routes.ts` is a direct template — including its documented
AI-SDK transport-envelope trap, which the copilot's `DefaultChatTransport` hits
identically.

---

## Service map

| Slice | Route | Extracted to | Error class |
|---|---|---|---|
| 1 | `referee/assignment` | ownership check folds into `referee-assignment.service` + `referee-claim.service` | `AssignmentError` (exists; 403/403) |
| 2 | `admin/referee-rules` | own-club check folds into `referee-rules.service` | `RefereeSettingsError` (exists; 404/400) |
| 2 | `admin/referee-eligible-games` | referee lookup folds into `eligible-open-games.service` | `RefereeSettingsError` — `NOT_FOUND`→404 matches exactly |
| 2 | `admin/referee` | none (already service-backed) | validation only |
| 3 | `public/team` | new `services/public/team-list.service.ts` | none |
| 3 | `public/scoreboard` | new `services/scoreboard/live-snapshot.ts` | none |
| 3 | `public/broadcast` | reuse `services/scoreboard/device-allowlist.ts` | none |
| 4 | `admin/scoreboard` | `listSnapshots` + `getDeviceHealth` into `services/scoreboard/live-snapshot.ts` | none |
| 4 | `admin/broadcast` | new `services/broadcast/match-picker.ts` | none |
| 4 | `admin/user` | new `services/admin/user-admin.service.ts` | new `UserAdminError` |
| 4 | `admin/sync`, `admin/settings` | none | validation + `code` only |
| 5 | `device` | new `services/notifications/push-device.service.ts` | new `PushDeviceError` |
| 6 | `admin/notification-test` | new `services/notifications/test-push.service.ts` | new `TestPushError` |
| 7 | `admin/assistant` | none | mirrors `qa.routes.ts` |

New error classes, each a leaf `*.errors.ts` with its own code→status table per
the `AGENTS.md` convention:

| Class | Codes |
|---|---|
| `UserAdminError` | `USER_NOT_FOUND` 404, `REFEREE_NOT_FOUND` 404 |
| `PushDeviceError` | `TOKEN_OWNED_BY_ANOTHER_USER` 409 |
| `TestPushError` | `NO_DEVICES` 400, `PUSH_CHANNEL_MISSING` 500 |

`RefereeSettingsError` is reused for eligible-games rather than adding a class
whose table would be a one-entry duplicate. The class name reads as narrower
than its use; that is the accepted cost.

### Two awkward cases

**`admin/user`'s `:id` is a better-auth text id,** not a number. It gets its own
string param schema, not `idParamSchema`.

**`admin/settings`'s `JSON.parse` fix is response validation, not request.**
`@dragons/contracts` is request-only per `CLAUDE.md`, so that schema lives beside
`settings.service.ts` with the `[7, 3, 1]` fallback. This is the one deliberate
departure from "schemas live in contracts", and it is deliberate because the
alternative is widening what `@dragons/contracts` means.

### `public/broadcast` allowlist unification

`public/broadcast.routes.ts` compares against `env.SCOREBOARD_DEVICE_ID` inline
while `admin/scoreboard.routes.ts` calls `isConfiguredDevice` from
`services/scoreboard/device-allowlist.ts`. Both become `isConfiguredDevice`.

---

## Testing

TDD per slice, red test first.

### The prerequisite: three test files do not wire `errorHandler`

```
apps/api/src/routes/admin/scoreboard.routes.test.ts    (slice 4)
apps/api/src/routes/public/broadcast.routes.test.ts    (slice 3)
apps/api/src/routes/public/scoreboard.routes.test.ts   (slice 3)
```

They pass today only because those routes catch their own errors. The moment
extraction moves a raise into a service, each falls through to a 500 — the same
break #56 hit in `broadcast.routes.test.ts`. Wiring the handler is the first step
of the slice that touches each file, not cleanup afterwards.

`apps/api/src/routes/referee/games.routes.test.ts` also omits `errorHandler`, but
`referee/games.routes.ts` uses only `referee-game-visibility.service`, which this
sweep does not touch. It is a latent version of the same hazard, not a
prerequisite here — worth fixing opportunistically, not worth widening a slice
for.

The app under test must be built as `new Hono<AppEnv>()`; `ErrorHandler<AppEnv>`
is not assignable to `ErrorHandler<BlankEnv>`, so typecheck catches the omission
but a test run does not.

### Standing hazards from #56's post-mortem

- A route test that mocks a service wholesale must import the **real** error
  class from its leaf `*.errors.ts` module. A stand-in `extends Error` double is
  not an `AppError`, falls through to 500, and silently stops the status
  assertions from testing anything. Three new classes means three fresh chances
  to plant one.
- Integration tests run against real PGlite. Never mock `drizzle-orm` or
  `@dragons/db/schema`.
- The `AppError` 5xx branch prints pino JSON through any suite that triggers one;
  `vi.mock("../../config/logger", () => ({ logger: { error: vi.fn() } }))` is the
  established way to silence it.

### Coverage and drift gates

Each new contract schema gets a `*.contract.test.ts` asserting the client's
request body or query parses against it, so client/server drift fails the build.
Extracted logic carries its tests with it, so `apps/api`'s thresholds (90%
branches, 95% functions/lines/statements) hold without new exemptions.
`docs-drift.test.ts` is re-checked whenever a 400/404 description changes.

---

## Intended behaviour changes

To be recorded on #75 and #52 when they close.

| Change | Risk |
|---|---|
| 404 bodies gain `code` | Additive |
| `no_devices` gains `code: "NO_DEVICES"`; web drops the message regex | One web edit, covered by test |
| test-push 429 moves to the shared `rateLimit` body; `Retry-After` becomes a constant 10 rather than the live TTL | No client reads either field |
| `admin/sync` bad `limit`: silent clamp to 100 → 400 | No client sends it |
| Malformed JSON: `HTTP_ERROR` → `VALIDATION_ERROR` | Shared handler; one line |
| Assistant: malformed JSON 500 → 400, array bounded, rate limit added | Very long chats now rejected |

---

## Verification

- Workspace-level `pnpm test` per slice, never package-scoped. A package-scoped
  run is what would have hidden #56's three broken route tests.
- Full gates (`typecheck`, `lint`, `test`, `coverage`, `knip`, `build`, the four
  `check:*` scripts) on the merged result, not per-branch — a clean
  `git merge-tree` is not evidence of a safe merge.
- Regression tests verified by reverting the production change and watching them
  fail. Where a test asserts more than one thing, each production change is
  reverted independently, so a passing second assertion cannot hide behind a
  failing first.
