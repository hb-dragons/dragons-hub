# Unify per-route error classes into a central `AppError` mapping

**Issue:** [#56](https://github.com/hb-dragons/dragons-hub/issues/56) (part of #44)
**Date:** 2026-07-28
**Scope:** `apps/api` only. This is the first of the four route-layer tickets
(#56, #52, #75, #76); #52/#75/#76 are re-planned afterwards, with the primitive
this spec introduces already in place.

---

## Problem

The API has six typed error classes and two different ways of turning them into
an HTTP response.

Three are mapped centrally in `middleware/error.ts`, each with its own
`instanceof` branch and its own import:

| Class | Module | Status |
|---|---|---|
| `SyncAlreadyQueuedError` | `services/sync-jobs.errors.ts` | 409 |
| `RefereeSdkNotConfiguredError` | `services/sync/sdk-client.errors.ts` | 503 |
| `TeamReorderError` | `services/admin/team-admin.errors.ts` | 400 |

Three are hand-mapped in the routes that call them:

| Class | Declared in | Mapped in |
|---|---|---|
| `AssignmentError` | `services/referee/referee-assignment.service.ts` | `routes/admin/referee-assignment.routes.ts`, `routes/referee/assignment.routes.ts` |
| `RefereeSettingsError` | `services/admin/referee-admin.service.ts` | `routes/admin/referee.routes.ts` |
| `BroadcastError` | `services/broadcast/config.ts` | `routes/admin/broadcast.routes.ts` |

Three concrete costs:

1. **`ERROR_STATUS_MAP` is duplicated and the two copies have diverged.** The
   referee copy carries `NOT_OWN_CLUB` and `NOT_ASSIGNED`; the admin copy does
   not. Both codes are thrown only by `referee-claim.service.ts`, which admin
   routes never call, so the gap is latent rather than a live 500 — but nothing
   stops a future caller from falling into it.
2. **The same try/catch is copy-pasted 9 times** — 3 in each assignment route
   file, 2 in `referee.routes.ts`, 1 in `broadcast.routes.ts`.
3. **`status as never` appears 6 times.** `ERROR_STATUS_MAP` is typed
   `Record<string, number>`, and `number` is not assignable to Hono's
   `ContentfulStatusCode`, so every call site casts the type system out of the
   way.

`error.ts` cannot simply import the three remaining classes. It deliberately
imports only leaf `*.errors.ts` modules, because importing a service module
would drag that service's dependencies — BullMQ and its Redis client, the
federation SDK and its token bucket, the database client — into every module
that touches the error handler. The three existing `*.errors.ts` files each
document this in a header comment.

---

## Design

### 1. The primitive

A new leaf module `apps/api/src/app-error.ts`, sitting alongside the existing
top-level `types.ts`, with no runtime imports:

```ts
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: ContentfulStatusCode,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
```

`new.target.name` sets the subclass's own name, which removes the six hand-set
`this.name = "..."` assignments and keeps `error.name` identical to today's
values.

The status lives **on the instance**, not in a lookup table owned by a route.
That is the whole point: a route can no longer hold a stale opinion about what a
service's error code means.

### 2. `error.ts` collapses to one branch

Three `instanceof` branches and three imports are replaced by:

```ts
if (error instanceof AppError) {
  if (error.status >= 500) {
    log.error(
      { err: error, stack_trace: error.stack, "@type": REPORTED_ERROR_TYPE },
      error.message,
    );
  }
  return c.json({ error: error.message, code: error.code }, error.status);
}
```

Placed above the `HTTPException` branch. The response body is
`{ error, code }` — byte-identical to what the routes return today.

The `>= 500` log is load-bearing, not decoration. See decision (d).

### 3. The six classes

Each subclass carries its own code→status table, co-located with the class.

| Class | New location | Status mapping |
|---|---|---|
| `SyncAlreadyQueuedError` | unchanged | 409 |
| `RefereeSdkNotConfiguredError` | unchanged | 503 |
| `TeamReorderError` | unchanged | 400 (both codes) |
| `AssignmentError` | **moves** to `services/referee/referee-assignment.errors.ts` | merged table, 7 codes |
| `RefereeSettingsError` | **moves** to `services/admin/referee-admin.errors.ts` | `NOT_FOUND`→404, `NOT_OWN_CLUB`→400, `VALIDATION_ERROR`→400 |
| `BroadcastError` | **moves** to `services/broadcast/config.errors.ts` | `MISSING_MATCH`→400, `ROW_MISSING`→500 |

The three that move must move: they are declared in modules that import the
database client and the SDK, so `error.ts` could not reach them otherwise. Each
new file gets the same header comment as the three existing `*.errors.ts`
modules, explaining why it is a leaf.

The merged `AssignmentError` table:

| Code | Status |
|---|---|
| `GAME_NOT_FOUND` | 404 |
| `NOT_QUALIFIED` | 422 |
| `SLOT_TAKEN` | 409 |
| `DENY_RULE` | 403 |
| `FEDERATION_ERROR` | 502 |
| `NOT_OWN_CLUB` | 403 |
| `NOT_ASSIGNED` | 409 |

`FORBIDDEN` is dropped: it appears in both route-level maps but no throw site
constructs an `AssignmentError` with it. The routes that return a `FORBIDDEN`
body build it inline and are unaffected.

### 4. The routes

Delete both `ERROR_STATUS_MAP` constants, all 9 try/catch blocks, and all 6
`status as never` casts. Each route body becomes a single success path; the
error class import disappears from the four route files.

`describeRoute`'s documented response codes stay accurate — the statuses do not
change for any code reachable through a route.

---

## Decisions

### (a) Per-class status tables, never one global code→status map

`NOT_OWN_CLUB` means two different things:

- In `AssignmentError` it is 403 — the request is well-formed and the caller may
  not do this.
- In `RefereeSettingsError` it is 400 — the referee named in the body is not an
  own-club referee, so the input is wrong.

A single shared table would have to pick one and silently change the other. Each
class owns its own mapping.

### (b) The merged `AssignmentError` table is the union of both copies

Admin routes gain `NOT_OWN_CLUB`→403 and `NOT_ASSIGNED`→409 where the missing
map entry would have produced a 500. Unreachable through today's call graph, and
correct if that changes.

### (c) `BroadcastError` gains real messages

Today the class is `super(code)`, so `message === "MISSING_MATCH"`, and
`broadcast.routes.ts` substitutes `"Cannot go live without matchId"` on the way
out. Centralizing the mapping without fixing the class would regress that
response body to the bare code string. The class takes a human-readable message
per code.

### (d) `ROW_MISSING` stays 500, which is why the branch logs

`ROW_MISSING` is an invariant violation — the device passed
`isConfiguredDevice()` but its row is absent — not a client error, so it keeps
its 500.

Today it falls through to the generic 500 path at the bottom of `errorHandler`,
which logs it with the Cloud Error Reporting `@type` marker. Routing it through
the `AppError` branch would make it stop being reported unless that branch logs
5xx itself. Hence the `status >= 500` check in §2.

---

## Testing

Test-first, per the repo default.

**`middleware/error.test.ts`**
- An `AppError` subclass maps to its own `status` and returns `{ error, code }`.
- An `AppError` with a 5xx status is logged with the `@type` reported-error
  marker; one with a 4xx status is not.
- The three previously-branched classes still produce 409 / 503 / 400.

**Class-level mapping tests** for the codes no route can reach:
`AssignmentError` with `NOT_OWN_CLUB` / `NOT_ASSIGNED`, and `BroadcastError`
with `ROW_MISSING`.

**Existing route tests must pass unchanged.** They already assert the statuses
for every reachable code; that is the regression net for the refactor. Any test
that needs editing is a signal that behavior changed, and each such edit has to
be justified against the decisions above rather than adjusted to fit.

**`pnpm test` across the workspace, not the package-scoped run.** `AppError`
and `error.ts` are shared primitives. Package-scoped runs have twice failed to
catch this class of break (#83, #141): route tests that mock a shared module
wholesale keep passing while the real path is broken.

Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm coverage`, `pnpm knip`.

---

## Out of scope

- Extracting business logic or database access from route files (#52).
- Moving hand-rolled validation onto `@dragons/contracts` (#75) — including the
  `Number(c.req.param(...))` checks in `routes/referee/assignment.routes.ts`,
  which stay as they are.
- Replacing `as` casts at SDK and database boundaries (#76).
- Any change to `HTTPException`, `ZodError` or the generic 500 handling beyond
  adding the branch above them.
