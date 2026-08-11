# Route-Layer Sweep (#75 + #52) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every hand-rolled route validation onto `@dragons/contracts` +
`validator()` + the shared `validationHook`, and move every direct database
access and business rule out of route files into services, one route group at a
time.

**Architecture:** Routes become a single success path: middleware validates,
`c.req.valid(...)` reads typed input, a service does the work, and typed errors
extending `AppError` carry their own HTTP status to `middleware/error.ts`. No
route imports `drizzle-orm`. No route catches its own service errors.

**Tech Stack:** Hono 4 + `hono-openapi` + `@hono/standard-validator`, Zod 4,
Drizzle ORM, Vitest 4, PGlite for API integration tests.

**Spec:** `docs/superpowers/specs/2026-07-28-route-layer-sweep-design.md`
**Branch:** `fix/issue-75-52` (already created; spec committed as `3781a872`)

## Global Constraints

- Request schemas live in `packages/contracts/src/<group>.ts`, zod-only,
  domain-noun-prefixed, re-exported **by name** from `index.ts`. Never redeclare
  a request schema in a route or in `@dragons/api-client`.
- Naming idiom: `<domain><Thing>ParamSchema` / `...QuerySchema` / `...BodySchema`.
  A plain `:id` param aliases the shared one: `export const fooIdParamSchema = idParamSchema;`
  (see `packages/contracts/src/team.ts:4`).
- New error classes go in a leaf `*.errors.ts` beside their service, extend
  `AppError`, and carry their own `Record<TheirCodeUnion, ContentfulStatusCode>`
  table. Never hoist those tables into a shared map.
- A route must not `try`/`catch` its own service errors.
- Test apps are built as `new Hono<AppEnv>()` and wire `app.onError(errorHandler)`.
  `ErrorHandler<AppEnv>` is not assignable to `ErrorHandler<BlankEnv>`, so a plain
  `new Hono()` fails typecheck rather than the test run.
- A route test that mocks a service wholesale imports the **real** error class
  from its leaf `*.errors.ts`. A stand-in `extends Error` double is not an
  `AppError` and silently falls through to 500.
- Never mock `drizzle-orm` or `@dragons/db/schema`. API integration tests run
  against real PGlite via `setupTestDb` / `resetTestDb` / `closeTestDb`.
- Verification is **workspace-level `pnpm test`**, never package-scoped. A
  package-scoped run is what hid #56's three broken route tests.
- Commit messages carry no `Co-Authored-By` or any AI-crediting trailer.
- Prose in `.md` files must pass `pnpm check:ai-slop`.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `apps/api/src/services/public/team-list.service.ts` | List public teams |
| `apps/api/src/services/scoreboard/live-snapshot.ts` | Read `liveScoreboards` + `scoreboardSnapshots` (public latest, admin list, admin health) |
| `apps/api/src/services/broadcast/match-picker.ts` | Own-club matches available for broadcast binding |
| `apps/api/src/services/admin/user-admin.service.ts` | Link/unlink a referee to a user account |
| `apps/api/src/services/admin/user-admin.errors.ts` | `UserAdminError` |
| `apps/api/src/services/notifications/push-device.service.ts` | Register/unregister push device tokens |
| `apps/api/src/services/notifications/push-device.errors.ts` | `PushDeviceError` |
| `apps/api/src/services/notifications/test-push.service.ts` | Admin test push: send, log, list recent |
| `apps/api/src/services/notifications/test-push.errors.ts` | `TestPushError` |
| `packages/contracts/src/assistant.ts` | Assistant reschedule chat body |

Each new service gets a co-located `*.test.ts`. Each new/changed contract gets
its `*.test.ts`, and where a client sends the shape, a `*.contract.test.ts`.

**Modified:** `apps/api/src/middleware/error.ts`; the route files and their tests
per task; `packages/contracts/src/{event,referee-self,referee,referee-rules,team,public,scoreboard,user,sync,devices,index}.ts`;
`apps/web/src/components/admin/push-test-card.tsx`.

---

## Task 1: Malformed JSON joins the validation envelope

Hono core throws `HTTPException(400, "Malformed JSON in request body")` before
`@hono/standard-validator` runs, so `validationHook` never sees it and
`errorHandler` currently labels it `HTTP_ERROR`. Every route in this sweep that
loses a hand-rolled `catch` would otherwise change its code from
`VALIDATION_ERROR` to `HTTP_ERROR`.

**Files:**
- Modify: `apps/api/src/middleware/error.ts:45-55`
- Test: `apps/api/src/middleware/error.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: an `HTTPException` with `status === 400` maps to
  `{ error: <message>, code: "VALIDATION_ERROR" }`. Every later task depends on
  this for its malformed-JSON assertions.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/middleware/error.test.ts`:

```ts
it("maps a 400 HTTPException to VALIDATION_ERROR", async () => {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.get("/boom", () => {
    throw new HTTPException(400, { message: "Malformed JSON in request body" });
  });

  const res = await app.request("/boom");
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({
    error: "Malformed JSON in request body",
    code: "VALIDATION_ERROR",
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @dragons/api test src/middleware/error.test.ts`
Expected: FAIL — received `code: "HTTP_ERROR"`.

- [ ] **Step 3: Add the branch**

In `apps/api/src/middleware/error.ts`, extend the existing ternary chain:

```ts
  if (error instanceof HTTPException) {
    const code =
      error.status === 400
        ? "VALIDATION_ERROR"
        : error.status === 401
          ? "UNAUTHORIZED"
          : error.status === 403
            ? "FORBIDDEN"
            : error.status === 404
              ? "NOT_FOUND"
              : "HTTP_ERROR";
    return c.json({ error: error.message, code }, error.status);
  }
```

- [ ] **Step 4: Run the whole workspace suite**

Run: `pnpm test`
Expected: PASS. If an existing test asserted `HTTP_ERROR` at 400, update it —
that is the intended change, not a regression.

- [ ] **Step 5: Verify the test earns its place**

Revert only the `error.status === 400` line, re-run
`pnpm --filter @dragons/api test src/middleware/error.test.ts`, confirm exactly
the new test fails, then restore.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/middleware/error.ts apps/api/src/middleware/error.test.ts
git commit -m "fix(api): map a 400 HTTPException to VALIDATION_ERROR

Hono core throws HTTPException(400) for malformed JSON before the standard
validator runs, so validationHook never sees it and the response carried
code HTTP_ERROR while every hand-rolled catch returned VALIDATION_ERROR.
One shape for one condition."
```

---

## Task 2: Slice 0 — bound the event contracts

`triggerEventSchema.type` accepts any string and is cast to `EventType` at the
call site. Event-list `from`/`to` are unvalidated, so `new Date("garbage")`
reaches `.toISOString()` and throws a 500.

**Files:**
- Modify: `packages/contracts/src/event.ts:4-24`
- Test: `packages/contracts/src/event.test.ts`

**Interfaces:**
- Consumes: `EVENT_TYPE_VALUES` from `@dragons/shared`
  (`packages/shared/src/domain-events.ts:78`) — the readonly array. `EVENT_TYPES`
  is an object map and will not satisfy `z.enum()`.
- Produces: `eventListQuerySchema.from`/`.to` typed as validated date strings;
  `triggerEventSchema.type` typed as `EventType`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/contracts/src/event.test.ts`:

```ts
describe("eventListQuerySchema date bounds", () => {
  it("rejects a non-date from", () => {
    expect(eventListQuerySchema.safeParse({ from: "garbage" }).success).toBe(false);
  });

  it("accepts an ISO date", () => {
    expect(eventListQuerySchema.safeParse({ from: "2026-07-28" }).success).toBe(true);
  });
});

describe("triggerEventSchema type", () => {
  it("rejects a type outside EVENT_TYPE_VALUES", () => {
    const result = triggerEventSchema.safeParse({
      type: "not.a.real.event",
      entityType: "match",
      entityId: 1,
      entityName: "x",
      deepLinkPath: "/x",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a known event type", () => {
    const result = triggerEventSchema.safeParse({
      type: EVENT_TYPE_VALUES[0],
      entityType: "match",
      entityId: 1,
      entityName: "x",
      deepLinkPath: "/x",
    });
    expect(result.success).toBe(true);
  });
});
```

Add `EVENT_TYPE_VALUES` to the `@dragons/shared` import in the test file.

- [ ] **Step 2: Run and watch fail**

Run: `pnpm --filter @dragons/contracts test src/event.test.ts`
Expected: FAIL — both `rejects` cases pass validation today.

- [ ] **Step 3: Tighten the schemas**

In `packages/contracts/src/event.ts`:

```ts
import { z } from "zod";
import {
  EVENT_ENTITY_TYPES,
  EVENT_URGENCIES,
  EVENT_TYPE_VALUES,
  dateSchema,
} from "@dragons/shared";

export const eventListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  type: z.string().optional(),
  entityType: z.string().optional(),
  source: z.string().optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  search: z.string().max(200).optional(),
  status: z.enum(["pending", "sent", "failed", "read"]).optional(),
});

export const triggerEventSchema = z.strictObject({
  type: z.enum(EVENT_TYPE_VALUES),
  entityType: z.enum(EVENT_ENTITY_TYPES),
  entityId: z.number().int().positive(),
  entityName: z.string().min(1).max(300),
  deepLinkPath: z.string().min(1).max(500),
  payload: z.record(z.string(), z.unknown()).default({}),
  urgencyOverride: z.enum(EVENT_URGENCIES).optional(),
});
```

- [ ] **Step 4: Drop the now-dead cast**

In `apps/api/src/routes/admin/event.routes.ts`, remove the `as EventType` cast on
the validated `type` — it is now that type. Run
`pnpm --filter @dragons/api typecheck` to confirm.

- [ ] **Step 5: Run the workspace suite**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/event.ts packages/contracts/src/event.test.ts \
        apps/api/src/routes/admin/event.routes.ts
git commit -m "fix(contracts): bound event type and event-list date range

triggerEvent accepted any string and laundered it to EventType with a cast.
Event-list from/to were unvalidated, so new Date(\"garbage\").toISOString()
threw and the route 500'd on a malformed query string."
```

---

## Task 3: Slice 1 — referee self-service assignment

The pattern-setter. `referee/assignment.routes.ts` hand-parses two path params,
hand-parses two bodies with `try`/`catch`, and runs the referee-ownership lookup
against `getDb()` inline across three handlers.

Per spec decision D1, the ownership check moves **into the services**, throwing
`AssignmentError` — whose `FORBIDDEN` and `NOT_OWN_CLUB` are both 403, matching
today's responses exactly.

**Files:**
- Modify: `packages/contracts/src/referee-self.ts`, `packages/contracts/src/index.ts`
- Modify: `apps/api/src/services/referee/referee-assignment.service.ts`
- Modify: `apps/api/src/services/referee/referee-claim.service.ts`
- Modify: `apps/api/src/routes/referee/assignment.routes.ts`
- Test: `apps/api/src/routes/referee/assignment.routes.test.ts`, and the two service tests

**Interfaces:**
- Consumes: `AssignmentError` from
  `apps/api/src/services/referee/referee-assignment.errors.ts` (exists; codes
  include `FORBIDDEN` and `NOT_OWN_CLUB`, both 403).
- Produces:
  - `refereeAssignParamSchema` — `{ spielplanId: number }`
  - `refereeClaimParamSchema` — `{ id: number }` (aliases `idParamSchema`)
  - `assignReferee(spielplanId: number, slotNumber: number, refereeApiId: number, callerRefereeId: number): Promise<AssignResult>`
  - `claimRefereeGame({ refereeId, gameId, slotNumber })` unchanged in shape;
    gains the not-linked guard.

- [ ] **Step 1: Add the param contracts**

In `packages/contracts/src/referee-self.ts`:

```ts
import { idParamSchema } from "./common";

export const refereeAssignParamSchema = z.object({
  spielplanId: z.coerce.number().int().positive(),
});
export type RefereeAssignParam = z.infer<typeof refereeAssignParamSchema>;

export const refereeClaimParamSchema = idParamSchema;
export type RefereeClaimParam = z.infer<typeof refereeClaimParamSchema>;
```

Re-export both by name from `packages/contracts/src/index.ts` alongside the
existing `refereeAssignBodySchema` / `refereeClaimBodySchema` exports.

- [ ] **Step 2: Write the failing service test**

In `apps/api/src/services/referee/referee-assignment.service.test.ts`, add a case
covering the moved ownership rule. This runs against real PGlite — seed a referee
row rather than mocking the database:

```ts
it("throws NOT_OWN_CLUB when the caller's referee is not own-club", async () => {
  const [ref] = await getDb()
    .insert(referees)
    .values({ apiId: 4242, name: "Outsider", isOwnClub: false })
    .returning({ id: referees.id });

  await expect(
    assignReferee(1, 1, 4242, ref!.id),
  ).rejects.toMatchObject({ code: "NOT_OWN_CLUB", status: 403 });
});

it("throws FORBIDDEN when assigning a different referee", async () => {
  const [ref] = await getDb()
    .insert(referees)
    .values({ apiId: 1111, name: "Self", isOwnClub: true })
    .returning({ id: referees.id });

  await expect(
    assignReferee(1, 1, 9999, ref!.id),
  ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
});
```

- [ ] **Step 3: Run and watch fail**

Run: `pnpm --filter @dragons/api test src/services/referee/referee-assignment.service.test.ts`
Expected: FAIL — `assignReferee` takes three arguments and performs no ownership check.

- [ ] **Step 4: Move the check into the service**

In `referee-assignment.service.ts`, add the fourth parameter and hoist the lookup
verbatim from the route:

```ts
export async function assignReferee(
  spielplanId: number,
  slotNumber: number,
  refereeApiId: number,
  callerRefereeId: number,
) {
  const [refereeRow] = await getDb()
    .select({ apiId: referees.apiId, isOwnClub: referees.isOwnClub })
    .from(referees)
    .where(eq(referees.id, callerRefereeId))
    .limit(1);

  if (!refereeRow || refereeRow.apiId !== refereeApiId) {
    throw new AssignmentError("Cannot assign another referee", "FORBIDDEN");
  }
  if (!refereeRow.isOwnClub) {
    throw new AssignmentError("Referee is not an own-club referee", "NOT_OWN_CLUB");
  }

  // ... existing body unchanged
}
```

- [ ] **Step 5: Rewrite the route as a single success path**

`apps/api/src/routes/referee/assignment.routes.ts` — no `getDb`, no `drizzle-orm`,
no `try`/`catch`:

```ts
refereeAssignmentRoutes.post(
  "/games/:spielplanId/assign",
  requireRefereeSelf,
  validator("param", refereeAssignParamSchema, validationHook),
  validator("json", refereeAssignBodySchema, validationHook),
  async (c) => {
    const { spielplanId } = c.req.valid("param");
    const { slotNumber, refereeApiId } = c.req.valid("json");
    const refereeId = c.get("refereeId");
    if (refereeId === undefined) {
      return c.json({ error: "Referee profile not linked", code: "FORBIDDEN" }, 403);
    }
    const result = await assignReferee(spielplanId, slotNumber, refereeApiId, refereeId);
    return c.json(result);
  },
);
```

Apply the same shape to both `/games/:id/claim` handlers using
`refereeClaimParamSchema`. The claim POST keeps `validator("json", refereeClaimBodySchema, validationHook)`:
every field on that schema is optional, and Hono's validator sets `value = {}`
when Content-Type is absent, so a bodyless request still means "no slot
preference". `packages/api-client/src/endpoints/referee.ts:62` already sends
`params ?? {}`.

- [ ] **Step 6: Update the route test**

The test mocks the services wholesale. It must import the **real**
`AssignmentError` from `../../services/referee/referee-assignment.errors`, and
the app must wire the handler:

```ts
import { errorHandler } from "../../middleware/error";
import { AssignmentError } from "../../services/referee/referee-assignment.errors";

const app = new Hono<AppEnv>();
app.onError(errorHandler);
app.route("/referee", refereeAssignmentRoutes);

it("maps a service NOT_OWN_CLUB to 403", async () => {
  mocks.assignReferee.mockRejectedValue(
    new AssignmentError("Referee is not an own-club referee", "NOT_OWN_CLUB"),
  );
  const res = await app.request("/referee/games/1/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotNumber: 1, refereeApiId: 1111 }),
  });
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ code: "NOT_OWN_CLUB" });
});

it("rejects a non-numeric spielplanId with the shared envelope", async () => {
  const res = await app.request("/referee/games/abc/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotNumber: 1, refereeApiId: 1111 }),
  });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
});
```

- [ ] **Step 7: Run the workspace suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/referee apps/api/src/services/referee \
        packages/contracts/src/referee-self.ts packages/contracts/src/index.ts
git commit -m "refactor(api): thin the referee self-service assignment routes

Path params and bodies validate through @dragons/contracts and the shared
validationHook. The referee-ownership lookup moves into the assignment and
claim services, throwing AssignmentError, whose FORBIDDEN and NOT_OWN_CLUB
are both 403 — the statuses the routes already returned."
```

---

## Task 4: Slice 2a — referee admin param validation

`admin/referee.routes.ts` repeats the same six-line id guard in three handlers.
No database access to extract; validation only.

**Files:**
- Modify: `packages/contracts/src/referee.ts`, `packages/contracts/src/index.ts`
- Modify: `apps/api/src/routes/admin/referee.routes.ts` (three handlers)
- Test: `apps/api/src/routes/admin/referee.routes.test.ts`

**Interfaces:**
- Produces: `refereeIdParamSchema` — `{ id: number }`, aliasing `idParamSchema`.

- [ ] **Step 1: Add the contract**

```ts
// packages/contracts/src/referee.ts
import { idParamSchema } from "./common";
export const refereeIdParamSchema = idParamSchema;
export type RefereeIdParam = z.infer<typeof refereeIdParamSchema>;
```

Re-export by name from `index.ts`.

- [ ] **Step 2: Write the failing test**

```ts
it.each([
  ["PATCH", "/admin/referees/abc/visibility"],
  ["PATCH", "/admin/referees/abc/rules"],
  ["GET", "/admin/referees/abc"],
])("%s %s rejects a non-numeric id with the shared envelope", async (method, path) => {
  const res = await app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify({}),
  });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({
    code: "VALIDATION_ERROR",
    details: expect.any(Array),
  });
});
```

- [ ] **Step 3: Run and watch fail**

Run: `pnpm --filter @dragons/api test src/routes/admin/referee.routes.test.ts`
Expected: FAIL — today's body is `{error: "Invalid referee ID", code: "VALIDATION_ERROR"}`
with no `details`.

- [ ] **Step 4: Swap in the validator**

For each of the three handlers, add
`validator("param", refereeIdParamSchema, validationHook)` to the middleware
chain and replace the guard with `const { id } = c.req.valid("param");`.

- [ ] **Step 5: Run the workspace suite**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin/referee.routes.ts \
        apps/api/src/routes/admin/referee.routes.test.ts \
        packages/contracts/src/referee.ts packages/contracts/src/index.ts
git commit -m "refactor(api): validate referee admin ids through contracts

Three handlers repeated the same id guard and returned a 400 without the
details array every other validated route emits."
```

---

## Task 5: Slice 2b — referee rules own-club check

`admin/referee-rules.routes.ts` already validates its param. What remains is
`requireOwnClubReferee`, a module-level function doing a `getDb()` lookup, plus
the two branches it feeds.

**Files:**
- Modify: `apps/api/src/services/referee/referee-rules.service.ts`
- Modify: `apps/api/src/routes/admin/referee-rules.routes.ts`
- Test: `apps/api/src/services/referee/referee-rules.service.test.ts`, `apps/api/src/routes/admin/referee-rules.routes.test.ts`

**Interfaces:**
- Consumes: `RefereeSettingsError` from
  `apps/api/src/services/admin/referee-admin.errors.ts` — `NOT_FOUND` 404,
  `NOT_OWN_CLUB` 400. Matches the route's current statuses exactly.
- Produces: `getRulesForReferee(id: number)` now throws instead of returning for
  the not-found and not-own-club cases.

- [ ] **Step 1: Write the failing service test**

```ts
it("throws NOT_FOUND for an unknown referee", async () => {
  await expect(getRulesForReferee(999999)).rejects.toMatchObject({
    code: "NOT_FOUND",
    status: 404,
  });
});

it("throws NOT_OWN_CLUB for a referee outside the club", async () => {
  const [ref] = await getDb()
    .insert(referees)
    .values({ apiId: 7777, name: "Outsider", isOwnClub: false })
    .returning({ id: referees.id });

  await expect(getRulesForReferee(ref!.id)).rejects.toMatchObject({
    code: "NOT_OWN_CLUB",
    status: 400,
  });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `pnpm --filter @dragons/api test src/services/referee/referee-rules.service.test.ts`
Expected: FAIL — the service resolves; the route holds these branches.

- [ ] **Step 3: Move the guard into the service**

Delete `requireOwnClubReferee` from the route and open `getRulesForReferee` with:

```ts
const [referee] = await getDb()
  .select({ isOwnClub: referees.isOwnClub })
  .from(referees)
  .where(eq(referees.id, id))
  .limit(1);

if (!referee) {
  throw new RefereeSettingsError("Referee not found", "NOT_FOUND");
}
if (!referee.isOwnClub) {
  throw new RefereeSettingsError("Referee is not an own-club referee", "NOT_OWN_CLUB");
}
```

- [ ] **Step 4: Reduce the route to one line of work**

```ts
  async (c) => {
    const { id } = c.req.valid("param");
    const result = await getRulesForReferee(id);
    return c.json(result);
  },
```

Remove the `getDb`, `referees` and `drizzle-orm` imports.

- [ ] **Step 5: Update the route test**

It mocks `referee-rules.service` wholesale, so it must import the real
`RefereeSettingsError` from `../../services/admin/referee-admin.errors` and wire
`errorHandler`. Assert 404/`NOT_FOUND` and 400/`NOT_OWN_CLUB` from rejected
service calls.

- [ ] **Step 6: Run the workspace suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/admin/referee-rules.routes.ts \
        apps/api/src/services/referee/referee-rules.service.ts \
        apps/api/src/routes/admin/referee-rules.routes.test.ts \
        apps/api/src/services/referee/referee-rules.service.test.ts
git commit -m "refactor(api): move the referee-rules own-club check into the service

The route held a getDb() lookup and two status branches. RefereeSettingsError
already maps NOT_FOUND to 404 and NOT_OWN_CLUB to 400 — the statuses the route
was returning by hand."
```

---

## Task 6: Slice 2c — referee eligible-games lookup

**Files:**
- Modify: `packages/contracts/src/referee.ts` (reuse `refereeIdParamSchema` from Task 4)
- Modify: `apps/api/src/services/referee/eligible-open-games.service.ts`
- Modify: `apps/api/src/routes/admin/referee-eligible-games.routes.ts`
- Test: the service test and `apps/api/src/routes/admin/referee-eligible-games.routes.test.ts`

**Interfaces:**
- Consumes: `refereeIdParamSchema` (Task 4), `RefereeSettingsError`.
- Produces: `getEligibleOpenGamesForReferee(id: number)` — takes the **internal**
  referee id, resolves `apiId` itself, and throws `RefereeSettingsError`
  `NOT_FOUND` (404) for an unknown referee. The existing `getEligibleOpenGames(apiId)`
  stays for callers that already hold an `apiId`.

Per the spec, `RefereeSettingsError` is reused rather than adding a class whose
table would be a one-entry duplicate.

- [ ] **Step 1: Write the failing service test**

```ts
it("throws NOT_FOUND for an unknown referee id", async () => {
  await expect(getEligibleOpenGamesForReferee(999999)).rejects.toMatchObject({
    code: "NOT_FOUND",
    status: 404,
  });
});

it("resolves the apiId and returns eligible games", async () => {
  const [ref] = await getDb()
    .insert(referees)
    .values({ apiId: 3131, name: "Ref", isOwnClub: true })
    .returning({ id: referees.id });

  await expect(getEligibleOpenGamesForReferee(ref!.id)).resolves.toBeDefined();
});
```

- [ ] **Step 2: Run and watch fail**

Run: `pnpm --filter @dragons/api test src/services/referee/eligible-open-games.service.test.ts`
Expected: FAIL — `getEligibleOpenGamesForReferee` is not exported.

- [ ] **Step 3: Add the wrapper**

```ts
export async function getEligibleOpenGamesForReferee(id: number) {
  const [row] = await getDb()
    .select({ apiId: referees.apiId })
    .from(referees)
    .where(eq(referees.id, id))
    .limit(1);

  if (!row) {
    throw new RefereeSettingsError("Referee not found", "NOT_FOUND");
  }
  return getEligibleOpenGames(row.apiId);
}
```

- [ ] **Step 4: Thin the route**

```ts
refereeEligibleGamesRoutes.get(
  "/referees/:id/eligible-open-games",
  requirePermission("assignment", "view"),
  validator("param", refereeIdParamSchema, validationHook),
  describeRoute({ /* unchanged */ }),
  async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await getEligibleOpenGamesForReferee(id));
  },
);
```

Remove the `getDb`, `referees` and `drizzle-orm` imports.

- [ ] **Step 5: Update the route test**

Wire `errorHandler`, build with `new Hono<AppEnv>()`, import the real
`RefereeSettingsError`, and assert the 400 envelope now carries `details`.

- [ ] **Step 6: Run the workspace suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/admin/referee-eligible-games.routes.ts \
        apps/api/src/services/referee/eligible-open-games.service.ts \
        apps/api/src/routes/admin/referee-eligible-games.routes.test.ts \
        apps/api/src/services/referee/eligible-open-games.service.test.ts
git commit -m "refactor(api): resolve the referee apiId inside the eligible-games service

The route ran the lookup against getDb() and returned its own 404. Reuses
RefereeSettingsError, whose NOT_FOUND already maps to 404, rather than adding
a class with a one-entry status table."
```

---

## Task 7: Slice 3a — public team list and stats

**Files:**
- Create: `apps/api/src/services/public/team-list.service.ts` + `.test.ts`
- Modify: `packages/contracts/src/public.ts`, `packages/contracts/src/index.ts`
- Modify: `apps/api/src/routes/public/team.routes.ts`
- Test: `apps/api/src/routes/public/team.routes.test.ts`

**Interfaces:**
- Produces:
  - `listPublicTeams(): Promise<Team[]>` — ordered `isOwnClub` desc,
    `displayOrder` asc, `name` asc.
  - `publicTeamIdParamSchema` — `{ id: number }`, aliasing `idParamSchema`.

`services/public/team-stats.service.ts` is not extended: its name does not
describe "list all teams" (spec decision D5).

- [ ] **Step 1: Write the failing service test**

```ts
it("orders own-club teams first, then by displayOrder, then name", async () => {
  await getDb().insert(teams).values([
    { apiTeamPermanentId: 1, name: "Zeta", isOwnClub: false, displayOrder: 1 },
    { apiTeamPermanentId: 2, name: "Alpha", isOwnClub: true, displayOrder: 2 },
    { apiTeamPermanentId: 3, name: "Beta", isOwnClub: true, displayOrder: 1 },
  ]);

  const result = await listPublicTeams();
  expect(result.map((t) => t.name)).toEqual(["Beta", "Alpha", "Zeta"]);
});
```

- [ ] **Step 2: Run and watch fail**

Run: `pnpm --filter @dragons/api test src/services/public/team-list.service.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the service**

```ts
// apps/api/src/services/public/team-list.service.ts
import { asc, desc } from "drizzle-orm";
import { teams } from "@dragons/db/schema";
import { getDb } from "../../config/database";

export async function listPublicTeams() {
  return getDb()
    .select()
    .from(teams)
    .orderBy(desc(teams.isOwnClub), asc(teams.displayOrder), asc(teams.name));
}
```

- [ ] **Step 4: Add the param contract and thin the route**

Add `publicTeamIdParamSchema = idParamSchema` to `packages/contracts/src/public.ts`,
re-export from `index.ts`, then:

```ts
publicTeamRoutes.get("/teams", describeRoute({ /* unchanged */ }), async (c) =>
  c.json(await listPublicTeams()),
);

publicTeamRoutes.get(
  "/teams/:id/stats",
  validator("param", publicTeamIdParamSchema, validationHook),
  describeRoute({ /* unchanged */ }),
  async (c) => {
    const { id } = c.req.valid("param");
    const stats = await getTeamStats(id);
    if (!stats) {
      return c.json({ error: "Team not found", code: "NOT_FOUND" }, 404);
    }
    return c.json(stats);
  },
);
```

The 404 gains `code` per spec decision D2. Remove the `getDb`, `teams` and
`drizzle-orm` imports.

- [ ] **Step 5: Update the route test**

Build with `new Hono<AppEnv>()`, wire `errorHandler`, mock
`services/public/team-list.service` rather than `config/database`, and assert the
404 body now includes `code: "NOT_FOUND"`.

- [ ] **Step 6: Run the workspace suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/public/team.routes.ts \
        apps/api/src/services/public/team-list.service.ts \
        apps/api/src/services/public/team-list.service.test.ts \
        apps/api/src/routes/public/team.routes.test.ts \
        packages/contracts/src/public.ts packages/contracts/src/index.ts
git commit -m "refactor(api): extract the public team list and validate the stats id

Adds code to the 404 so APIError.code stops falling back to UNKNOWN_ERROR."
```

---

## Task 8: Slice 3b — public match id and opponent filter

`public/match.routes.ts:33-37` reads `opponentApiId` through `c.req.query()`
*after* `validator("query", ...)` has run, coercing it with a bare `Number()`.
Two later handlers hand-parse `:id` with `Number.isNaN` only — so `-1` and `0`
reach the service.

**Files:**
- Modify: `packages/contracts/src/match.ts`, `packages/contracts/src/index.ts`
- Modify: `apps/api/src/routes/public/match.routes.ts:33-37,101-124`
- Test: `apps/api/src/routes/public/match.routes.test.ts`

**Interfaces:**
- Produces: the existing public-match query schema gains
  `opponentApiId: z.coerce.number().int().positive().optional()`;
  `publicMatchIdParamSchema` — `{ id: number }`.

`packages/api-client/src/endpoints/public.ts:13` already types `opponentApiId` as
`number`, and the web and native h2h screens pass a number, so bounding it breaks
no caller.

- [ ] **Step 1: Write the failing tests**

```ts
it("rejects a non-numeric opponentApiId", async () => {
  const res = await app.request("/public/matches?opponentApiId=abc");
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
});

it("rejects a zero match id", async () => {
  const res = await app.request("/public/matches/0");
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `pnpm --filter @dragons/api test src/routes/public/match.routes.test.ts`
Expected: FAIL — `abc` becomes `NaN` and passes through; `0` passes `!Number.isNaN`.

- [ ] **Step 3: Fold the filter into the query schema**

Add `opponentApiId: z.coerce.number().int().positive().optional()` to the public
match query schema and `publicMatchIdParamSchema = idParamSchema`. Re-export both.

- [ ] **Step 4: Read only validated input**

```ts
  async (c) => {
    const query = c.req.valid("query");
    const result = await getOwnClubMatches({ ...query, excludeInactive: true });
    return c.json(result);
  },
```

For both `:id` handlers, add
`validator("param", publicMatchIdParamSchema, validationHook)`, read
`const { id } = c.req.valid("param")`, and add `code: "NOT_FOUND"` to the 404s.

- [ ] **Step 5: Run the workspace suite**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/public/match.routes.ts \
        apps/api/src/routes/public/match.routes.test.ts \
        packages/contracts/src/match.ts packages/contracts/src/index.ts
git commit -m "fix(api): validate the public match id and opponent filter

opponentApiId was read through c.req.query() after the query validator had
already run, so a non-numeric value became NaN and reached the service. The
id guards checked only Number.isNaN, letting 0 and negatives through."
```

---

## Task 9: Slice 3c — public scoreboard and broadcast

Both route tests are in the missing-`errorHandler` set, and
`public/scoreboard.routes.test.ts` mocks `config/database` with a hand-rolled
drizzle chain that extraction invalidates. **Fix the harness first.**

**Files:**
- Create: `apps/api/src/services/scoreboard/live-snapshot.ts` + `.test.ts`
- Modify: `packages/contracts/src/scoreboard.ts`, `packages/contracts/src/index.ts`
- Modify: `apps/api/src/routes/public/scoreboard.routes.ts`, `apps/api/src/routes/public/broadcast.routes.ts`
- Test: both route tests

**Interfaces:**
- Produces:
  - `getLatestSnapshot(deviceId: string): Promise<LiveScoreboardRow | null>`
  - `scoreboardDeviceQuerySchema` — `{ deviceId: string }` (`z.string().min(1)`)
- Consumes: `isConfiguredDevice`, `UNKNOWN_DEVICE_BODY` from
  `services/scoreboard/device-allowlist.ts`.

- [ ] **Step 1: Write the failing service test**

```ts
it("returns null when the device has no live row", async () => {
  await expect(getLatestSnapshot("nope")).resolves.toBeNull();
});

it("returns the live row for a known device", async () => {
  await getDb().insert(liveScoreboards).values({ deviceId: "d1", scoreHome: 5 });
  const row = await getLatestSnapshot("d1");
  expect(row?.scoreHome).toBe(5);
});
```

- [ ] **Step 2: Run and watch fail**

Run: `pnpm --filter @dragons/api test src/services/scoreboard/live-snapshot.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the service**

```ts
// apps/api/src/services/scoreboard/live-snapshot.ts
import { eq } from "drizzle-orm";
import { liveScoreboards } from "@dragons/db/schema";
import { getDb } from "../../config/database";

export async function getLatestSnapshot(deviceId: string) {
  const rows = await getDb()
    .select()
    .from(liveScoreboards)
    .where(eq(liveScoreboards.deviceId, deviceId))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Add the query contract and thin both routes**

Add `scoreboardDeviceQuerySchema = z.object({ deviceId: z.string().min(1) })`
to `packages/contracts/src/scoreboard.ts`; re-export.

`public/scoreboard.routes.ts` — `/latest`:

```ts
  validator("query", scoreboardDeviceQuerySchema, validationHook),
  async (c) => {
    const { deviceId } = c.req.valid("query");
    const row = await getLatestSnapshot(deviceId);
    if (!row) return c.json({ error: "No data", code: "NO_DATA" }, 404);
    c.header("Cache-Control", "no-store");
    return c.json({ ...row, secondsSinceLastFrame: computeSecondsSince(row.lastFrameAt) });
  },
```

`/stream` takes the same validator and then `isConfiguredDevice(deviceId)`.

`public/broadcast.routes.ts` — replace the inline
`deviceId !== env.SCOREBOARD_DEVICE_ID` comparison with `isConfiguredDevice`, and
drop the `env` import if it becomes unused.

- [ ] **Step 5: Repair both test harnesses**

For each file: build as `new Hono<AppEnv>()`, add `app.onError(errorHandler)`,
and replace the `vi.mock("../../config/database", ...)` drizzle chain with a mock
of `services/scoreboard/live-snapshot`. Add a case asserting a missing `deviceId`
now returns the shared envelope:

```ts
it("rejects a missing deviceId with the shared envelope", async () => {
  const res = await app.request("/public/scoreboard/latest");
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({
    code: "VALIDATION_ERROR",
    details: expect.any(Array),
  });
});
```

- [ ] **Step 6: Run the workspace suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/public/scoreboard.routes.ts \
        apps/api/src/routes/public/broadcast.routes.ts \
        apps/api/src/services/scoreboard/live-snapshot.ts \
        apps/api/src/services/scoreboard/live-snapshot.test.ts \
        apps/api/src/routes/public/scoreboard.routes.test.ts \
        apps/api/src/routes/public/broadcast.routes.test.ts \
        packages/contracts/src/scoreboard.ts packages/contracts/src/index.ts
git commit -m "refactor(api): extract the live scoreboard read and unify the device allowlist

public/broadcast compared against env.SCOREBOARD_DEVICE_ID inline while
admin/scoreboard used isConfiguredDevice; both now use the allowlist. Both
route tests gain errorHandler — they passed only because the routes caught
their own errors."
```

---

## Task 10: Slice 3d — public asset error codes

The router pattern `:id{[0-9]+\.webp}` already performs the real validation, so
no `validator()` swap is warranted. Only the bodies change.

**Files:**
- Modify: `apps/api/src/routes/public/assets.routes.ts:30,35`
- Test: `apps/api/src/routes/public/assets.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("returns a coded 404 for a missing logo", async () => {
  const res = await app.request("/public/assets/clubs/999999.webp");
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: "Not found", code: "NOT_FOUND" });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `pnpm --filter @dragons/api test src/routes/public/assets.routes.test.ts`
Expected: FAIL — body is `{error: "Not found"}` with no `code`.

- [ ] **Step 3: Add the codes**

```ts
return c.json({ error: "Invalid clubId", code: "VALIDATION_ERROR" }, 400);
...
return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
```

- [ ] **Step 4: Run and commit**

```bash
pnpm test
git add apps/api/src/routes/public/assets.routes.ts \
        apps/api/src/routes/public/assets.routes.test.ts
git commit -m "fix(api): add error codes to the club logo responses"
```

---

## Task 11: Slice 4a — admin scoreboard reads

**Files:**
- Modify: `apps/api/src/services/scoreboard/live-snapshot.ts` (extend from Task 9)
- Modify: `apps/api/src/routes/admin/scoreboard.routes.ts`
- Test: `apps/api/src/services/scoreboard/live-snapshot.test.ts`, `apps/api/src/routes/admin/scoreboard.routes.test.ts`

**Interfaces:**
- Consumes: `getLatestSnapshot` (Task 9), `scoreboardDeviceQuerySchema` (Task 9),
  `scoreboardListQuerySchema` (exists).
- Produces:
  - `listSnapshots(q: { deviceId: string; afterId?: number; limit: number }): Promise<ScoreboardSnapshotRow[]>`
  - `getDeviceHealth(deviceId: string): Promise<{ deviceId: string; lastFrameAt: Date | null; secondsSinceLastFrame: number | null; online: boolean }>`

- [ ] **Step 1: Write the failing service tests**

```ts
it("filters snapshots after a given id and honours the limit", async () => {
  await getDb().insert(scoreboardSnapshots).values([
    { deviceId: "d1", payload: {} },
    { deviceId: "d1", payload: {} },
    { deviceId: "d1", payload: {} },
  ]);
  const all = await listSnapshots({ deviceId: "d1", limit: 10 });
  const after = await listSnapshots({ deviceId: "d1", afterId: all[1]!.id, limit: 10 });
  expect(after.every((r) => r.id > all[1]!.id)).toBe(true);
});

it("reports a device with no live row as offline", async () => {
  await expect(getDeviceHealth("silent")).resolves.toMatchObject({
    deviceId: "silent",
    lastFrameAt: null,
    online: false,
  });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `pnpm --filter @dragons/api test src/services/scoreboard/live-snapshot.test.ts`
Expected: FAIL — neither function is exported.

- [ ] **Step 3: Add both functions**

Move the two query bodies verbatim out of the route, keeping the
`SCOREBOARD_ONLINE_THRESHOLD_MS` comparison and `computeSecondsSince` call that
produce `online`.

- [ ] **Step 4: Thin the route**

`/snapshots` keeps `validator("query", scoreboardListQuerySchema, validationHook)`
and calls `listSnapshots(query)`. `/health` gains
`validator("query", scoreboardDeviceQuerySchema, validationHook)`, replacing the
hand-rolled `deviceId required` 400, then calls `getDeviceHealth(deviceId)`.
Both keep their `isConfiguredDevice` guard. Remove the `getDb`, schema and
`drizzle-orm` imports.

- [ ] **Step 5: Repair the test harness**

`admin/scoreboard.routes.test.ts` is in the missing-`errorHandler` set. Build as
`new Hono<AppEnv>()`, add `app.onError(errorHandler)`, mock
`services/scoreboard/live-snapshot` rather than the database, and assert the
missing-`deviceId` 400 now carries `details`.

- [ ] **Step 6: Run the workspace suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/admin/scoreboard.routes.ts \
        apps/api/src/services/scoreboard/live-snapshot.ts \
        apps/api/src/services/scoreboard/live-snapshot.test.ts \
        apps/api/src/routes/admin/scoreboard.routes.test.ts
git commit -m "refactor(api): extract the admin scoreboard snapshot and health reads"
```

---

## Task 12: Slice 4b — broadcast match picker

The `/matches` handler is ~70 lines of query building: two `alias()` calls, an
own-club id lookup, an optional text filter with a second round trip, and a
five-table join.

**Files:**
- Create: `apps/api/src/services/broadcast/match-picker.ts` + `.test.ts`
- Modify: `apps/api/src/routes/admin/broadcast.routes.ts`
- Test: `apps/api/src/routes/admin/broadcast.routes.test.ts`

**Interfaces:**
- Produces:
  `listBroadcastableMatches(opts: { q?: string; scope?: "today" | string }): Promise<Array<{ id: number; kickoffDate: string; kickoffTime: string | null; homeName: string | null; guestName: string | null; leagueName: string | null }>>`

- [ ] **Step 1: Write the failing service test**

```ts
it("returns an empty list when the club owns no teams", async () => {
  await expect(listBroadcastableMatches({})).resolves.toEqual([]);
});

it("filters to today when scope is today", async () => {
  await getDb().insert(teams).values([
    { apiTeamPermanentId: 10, name: "Dragons", isOwnClub: true },
    { apiTeamPermanentId: 20, name: "Visitors", isOwnClub: false },
  ]);
  const today = new Date().toISOString().slice(0, 10);
  await getDb().insert(matches).values([
    {
      apiMatchId: 1, matchNo: 1, matchDay: 1,
      kickoffDate: today, kickoffTime: "19:00:00",
      homeTeamApiId: 10, guestTeamApiId: 20,
    },
    {
      apiMatchId: 2, matchNo: 2, matchDay: 2,
      kickoffDate: "2099-01-01", kickoffTime: "19:00:00",
      homeTeamApiId: 10, guestTeamApiId: 20,
    },
  ]);

  const result = await listBroadcastableMatches({ scope: "today" });
  expect(result).toHaveLength(1);
  expect(result[0]?.kickoffDate).toBe(today);
});

it("escapes LIKE metacharacters in the text filter", async () => {
  await expect(listBroadcastableMatches({ q: "100%" })).resolves.toEqual([]);
});
```

- [ ] **Step 2: Run and watch fail**

Run: `pnpm --filter @dragons/api test src/services/broadcast/match-picker.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Move the query**

Create `match-picker.ts` holding the two `alias()` declarations, the
`escapeLikePattern` use, and the query body verbatim. Both early returns become
`return []`.

- [ ] **Step 4: Thin the route**

```ts
  async (c) => {
    const { q, scope } = c.req.valid("query");
    return c.json({ matches: await listBroadcastableMatches({ q, scope }) });
  },
```

Remove the `getDb`, `alias`, schema-table and `drizzle-orm` imports. Confirm no
`drizzle-orm` import remains: `grep -n 'drizzle-orm' apps/api/src/routes/admin/broadcast.routes.ts`
should print nothing.

- [ ] **Step 5: Run the workspace suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin/broadcast.routes.ts \
        apps/api/src/services/broadcast/match-picker.ts \
        apps/api/src/services/broadcast/match-picker.test.ts \
        apps/api/src/routes/admin/broadcast.routes.test.ts
git commit -m "refactor(api): extract the broadcast match picker query"
```

---

## Task 13: Slice 4c — user referee link

**Files:**
- Create: `apps/api/src/services/admin/user-admin.service.ts` + `.test.ts`
- Create: `apps/api/src/services/admin/user-admin.errors.ts` + `.test.ts`
- Modify: `packages/contracts/src/user.ts`, `packages/contracts/src/index.ts`
- Modify: `apps/api/src/routes/admin/user.routes.ts`
- Test: `apps/api/src/routes/admin/user.routes.test.ts`

**Interfaces:**
- Produces:
  - `UserAdminError` with `UserAdminErrorCode = "USER_NOT_FOUND" | "REFEREE_NOT_FOUND"`, both 404
  - `setUserRefereeLink(userId: string, refereeId: number | null): Promise<{ id: string; refereeId: number | null }>`
  - `userIdParamSchema` — `{ id: z.string().min(1).max(255) }`

The `:id` here is a **better-auth text id**, not a number, so it must not alias
`idParamSchema`.

- [ ] **Step 1: Write the failing errors test**

```ts
// apps/api/src/services/admin/user-admin.errors.test.ts
it("maps both codes to 404", () => {
  expect(new UserAdminError("x", "USER_NOT_FOUND").status).toBe(404);
  expect(new UserAdminError("x", "REFEREE_NOT_FOUND").status).toBe(404);
});

it("is an AppError so the central handler maps it", () => {
  expect(new UserAdminError("x", "USER_NOT_FOUND")).toBeInstanceOf(AppError);
});
```

- [ ] **Step 2: Run and watch fail**

Run: `pnpm --filter @dragons/api test src/services/admin/user-admin.errors.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the error class**

```ts
// apps/api/src/services/admin/user-admin.errors.ts
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../../app-error";

export type UserAdminErrorCode = "USER_NOT_FOUND" | "REFEREE_NOT_FOUND";

const USER_ADMIN_ERROR_STATUS: Record<UserAdminErrorCode, ContentfulStatusCode> = {
  USER_NOT_FOUND: 404,
  REFEREE_NOT_FOUND: 404,
};

export class UserAdminError extends AppError {
  declare readonly code: UserAdminErrorCode;

  constructor(message: string, code: UserAdminErrorCode) {
    super(message, code, USER_ADMIN_ERROR_STATUS[code]);
  }
}
```

- [ ] **Step 4: Write the failing service test, then the service**

```ts
it("throws REFEREE_NOT_FOUND when linking an unknown referee", async () => {
  await expect(setUserRefereeLink("u1", 999999)).rejects.toMatchObject({
    code: "REFEREE_NOT_FOUND",
  });
});

it("throws USER_NOT_FOUND when the user does not exist", async () => {
  await expect(setUserRefereeLink("ghost", null)).rejects.toMatchObject({
    code: "USER_NOT_FOUND",
  });
});
```

Then move both queries out of the route into `setUserRefereeLink`, replacing each
`return c.json(...)` with the matching `throw new UserAdminError(...)`.

- [ ] **Step 5: Thin the route**

```ts
  validator("param", userIdParamSchema, validationHook),
  validator("json", userRefereeLinkBodySchema, validationHook),
  async (c) => {
    const { id } = c.req.valid("param");
    const { refereeId } = c.req.valid("json");
    return c.json(await setUserRefereeLink(id, refereeId));
  },
```

- [ ] **Step 6: Update the route test**

It mocks the service wholesale, so it must import the real `UserAdminError`.
Assert both 404 codes.

- [ ] **Step 7: Run the workspace suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/admin/user.routes.ts apps/api/src/services/admin/user-admin.* \
        apps/api/src/routes/admin/user.routes.test.ts \
        packages/contracts/src/user.ts packages/contracts/src/index.ts
git commit -m "refactor(api): extract the user referee-link service

Adds UserAdminError so the two 404s carry codes. The :id param is a
better-auth text id, so it gets a string schema rather than idParamSchema."
```

---

## Task 14: Slice 4d — sync limit and settings reminder days

Three unrelated small fixes in two files, all validation or response shape.

**Files:**
- Modify: `packages/contracts/src/sync.ts:44-56`, `packages/contracts/src/index.ts`
- Modify: `apps/api/src/routes/admin/sync.routes.ts:99-108`
- Modify: `apps/api/src/services/admin/settings.service.ts`
- Modify: `apps/api/src/routes/admin/settings.routes.ts:95-106,137-141`
- Test: the two route tests and `settings.service.test.ts`

**Interfaces:**
- Produces:
  - `syncJobStatusesQuerySchema` gains
    `limit: z.coerce.number().int().positive().max(500).default(100)`
  - `getRefereeReminderDays(): Promise<number[]>` — parses the stored JSON through
    a schema, falling back to `[7, 3, 1]`

- [ ] **Step 1: Write the failing tests**

```ts
// sync.routes.test.ts
it("rejects a limit above the cap instead of silently clamping", async () => {
  const res = await app.request("/admin/sync/jobs?limit=9999");
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
});

// settings.service.test.ts
it("falls back to the default when the stored value is not an array of numbers", async () => {
  await upsertSetting("referee_reminder_days", JSON.stringify({ nope: true }));
  await expect(getRefereeReminderDays()).resolves.toEqual([7, 3, 1]);
});

// settings.routes.test.ts
it("codes the already-queued 409", async () => {
  mocks.triggerRefereeGamesSync.mockResolvedValue(null);
  const res = await app.request("/admin/settings/referee-games-sync", { method: "POST" });
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ code: "SYNC_ALREADY_QUEUED" });
});
```

- [ ] **Step 2: Run and watch all three fail**

Run: `pnpm --filter @dragons/api test src/routes/admin/sync.routes.test.ts src/routes/admin/settings.routes.test.ts src/services/admin/settings.service.test.ts`
Expected: FAIL — 9999 clamps to 100 and returns 200; the object round-trips as
`days`; the 409 has no `code`.

- [ ] **Step 3: Fold `limit` into the sync contract**

Add the `limit` field to `syncJobStatusesQuerySchema`, then in the route replace
the three-line clamp with `const { statuses, limit } = c.req.valid("query");`.
No client sends this parameter, so the tightening breaks nothing.

- [ ] **Step 4: Validate the stored reminder days**

In `settings.service.ts` — the schema lives here, **not** in `@dragons/contracts`,
because this validates a stored value rather than a request (spec decision D5):

```ts
const REFEREE_REMINDER_DAYS_FALLBACK = [7, 3, 1];
const refereeReminderDaysSchema = z.array(z.number().int().positive()).min(1);

export async function getRefereeReminderDays(): Promise<number[]> {
  const value = await getSetting("referee_reminder_days");
  if (!value) return REFEREE_REMINDER_DAYS_FALLBACK;
  try {
    const parsed = refereeReminderDaysSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : REFEREE_REMINDER_DAYS_FALLBACK;
  } catch {
    return REFEREE_REMINDER_DAYS_FALLBACK;
  }
}
```

The route becomes `return c.json({ days: await getRefereeReminderDays() });`.

- [ ] **Step 5: Code the 409**

```ts
return c.json(
  {
    error: "Referee games sync already in progress or queued",
    code: "SYNC_ALREADY_QUEUED",
  },
  409,
);
```

`triggerRefereeGamesSync` keeps returning `null` — `workers/index.ts:115` calls it
and ignores the result, where "already queued" is a normal outcome, so converting
it to throw would surface an unhandled rejection in the worker (spec decision D4).

- [ ] **Step 6: Run the workspace suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/admin/sync.routes.ts apps/api/src/routes/admin/settings.routes.ts \
        apps/api/src/services/admin/settings.service.ts \
        apps/api/src/routes/admin/sync.routes.test.ts \
        apps/api/src/routes/admin/settings.routes.test.ts \
        apps/api/src/services/admin/settings.service.test.ts \
        packages/contracts/src/sync.ts packages/contracts/src/index.ts
git commit -m "fix(api): validate the sync job limit and the stored reminder days

The jobs limit was read outside the validated query and silently clamped.
The reminder-days GET returned raw JSON.parse output. The already-queued
409 carried no code."
```

---

## Task 15: Slice 5 — push device registration

**Files:**
- Create: `apps/api/src/services/notifications/push-device.service.ts` + `.test.ts`
- Create: `apps/api/src/services/notifications/push-device.errors.ts` + `.test.ts`
- Modify: `packages/contracts/src/devices.ts`, `packages/contracts/src/index.ts`
- Modify: `apps/api/src/routes/device.routes.ts`
- Test: `apps/api/src/routes/device.routes.test.ts`

**Interfaces:**
- Produces:
  - `PushDeviceError` with code `"TOKEN_OWNED_BY_ANOTHER_USER"` → 409
  - `registerPushDevice(input: { userId: string; token: string; platform: string; locale?: string }): Promise<void>`
  - `unregisterPushDevice(userId: string, token: string): Promise<void>`
  - `deviceTokenParamSchema` — `{ token: z.string().min(1).max(512) }`

- [ ] **Step 1: Write the failing service test**

```ts
it("rejects a token already registered to another account", async () => {
  await registerPushDevice({ userId: "u1", token: "tok", platform: "ios" });
  await expect(
    registerPushDevice({ userId: "u2", token: "tok", platform: "ios" }),
  ).rejects.toMatchObject({ code: "TOKEN_OWNED_BY_ANOTHER_USER", status: 409 });
});

it("lets the rightful owner re-register", async () => {
  await registerPushDevice({ userId: "u1", token: "tok", platform: "ios" });
  await expect(
    registerPushDevice({ userId: "u1", token: "tok", platform: "android" }),
  ).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run and watch fail**

Run: `pnpm --filter @dragons/api test src/services/notifications/push-device.service.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the error class and service**

`push-device.errors.ts` follows the `UserAdminError` shape from Task 13 with a
single-entry table. `push-device.service.ts` takes the upsert verbatim from the
route, **keeping the `setWhere` ownership fold and its comment** — that is the
race-safety property, not an incidental detail — and replaces the `if (!row)`
response with `throw new PushDeviceError(...)`. The `logger.warn` moves with it,
still omitting the token.

- [ ] **Step 4: Thin the route**

```ts
  validator("json", deviceRegisterBodySchema, validationHook),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    const { token, platform, locale } = c.req.valid("json");
    await registerPushDevice({ userId: session.user.id, token, platform, locale });
    return c.json({ success: true });
  },
```

`DELETE /:token` gains `validator("param", deviceTokenParamSchema, validationHook)`
and calls `unregisterPushDevice`. Remove the `getDb`, `pushDevices` and
`drizzle-orm` imports.

- [ ] **Step 5: Update the route test**

Import the real `PushDeviceError`; assert the 409 body keeps
`code: "TOKEN_OWNED_BY_ANOTHER_USER"`.

- [ ] **Step 6: Run the workspace suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/device.routes.ts apps/api/src/services/notifications/push-device.* \
        apps/api/src/routes/device.routes.test.ts \
        packages/contracts/src/devices.ts packages/contracts/src/index.ts
git commit -m "refactor(api): extract push device registration

Keeps the setWhere ownership fold that makes concurrent registrations safe."
```

---

## Task 16: Slice 6 — admin test push

The largest slice. Per the spec it may split into more than one commit if a seam
appears, provided the `domainEvents` + `notificationLog` transaction stays whole
within a single commit. A natural split is **16a** (the send path and its
service) and **16b** (the recent-list read plus the web client change).

**Files:**
- Create: `apps/api/src/services/notifications/test-push.service.ts` + `.test.ts`
- Create: `apps/api/src/services/notifications/test-push.errors.ts` + `.test.ts`
- Modify: `apps/api/src/routes/admin/notification-test.routes.ts`
- Modify: `apps/web/src/components/admin/push-test-card.tsx:85`
- Test: `apps/api/src/routes/admin/notification-test.routes.test.ts`, `apps/web/src/components/admin/push-test-card.test.tsx`

**Interfaces:**
- Produces:
  - `TestPushError` — `NO_DEVICES` 400, `PUSH_CHANNEL_MISSING` 500
  - `sendAdminTestPush(input: { callerId: string; message?: string }): Promise<{ deviceCount: number; tickets: Array<{ platform: string; status: string; ticketId: string | null; error: string | null }> }>`
  - `listRecentTestPushes(callerId: string): Promise<Array<{ id: number; sentAt: Date; recipientToken: string | null; status: string; providerTicketId: string | null; errorMessage: string | null }>>`

- [ ] **Step 1: Write the failing errors test**

Mirror Task 13's shape. Assert `NO_DEVICES` is 400, `PUSH_CHANNEL_MISSING` is 500,
and both are `instanceof AppError`.

- [ ] **Step 2: Write the failing service tests**

```ts
it("throws NO_DEVICES when the admin has registered none", async () => {
  await expect(sendAdminTestPush({ callerId: "u1" })).rejects.toMatchObject({
    code: "NO_DEVICES",
    status: 400,
  });
});

it("writes exactly one notification_log row for a multi-device send", async () => {
  await getDb().insert(channelConfigs).values({
    name: "Push", type: "push", config: {},
  });
  await getDb().insert(pushDevices).values([
    { userId: "u1", token: "tok-a", platform: "ios" },
    { userId: "u1", token: "tok-b", platform: "android" },
  ]);

  await sendAdminTestPush({ callerId: "u1" });

  const rows = await getDb().select().from(notificationLog);
  expect(rows).toHaveLength(1);
});

it("masks all but the last six characters of the token", async () => {
  const rows = await listRecentTestPushes("u1");
  expect(rows[0]?.recipientToken).toMatch(/^\.\.\./);
});
```

The one-row assertion is the regression guard for issue #122 — the dedup index
`notification_log_dedup_idx` makes a row-per-device a 500.

- [ ] **Step 3: Run and watch fail**

Run: `pnpm --filter @dragons/api test src/services/notifications/test-push.service.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Move the handler body into the service**

Take everything from the device query through the transaction verbatim, including
the aggregate-row comment block explaining #122. `maskToken` moves too. Replace
the two error responses with `throw new TestPushError(...)`. The
`log.error("push channel_config row missing")` call is now redundant with the
`AppError` 5xx reporting branch — drop it and let `errorHandler` report.

- [ ] **Step 5: Swap the cooldown for the shared rate limiter**

Delete the inline Redis `SET NX` cooldown and the `TEST_PUSH_COOLDOWN_*`
constants, and add to the middleware chain:

```ts
rateLimit({ limit: 1, windowSeconds: 10, keyPrefix: "test-push" }),
```

This changes the 429 body from `{error: "rate_limited", retryAfter}` to
`{error: "Too many requests", code: "RATE_LIMITED"}` and makes `Retry-After` a
constant 10 rather than the live TTL. Nothing in `apps/web`, `apps/native` or
`packages/api-client` reads either field.

- [ ] **Step 6: Thin both handlers**

```ts
  async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    const { message } = c.req.valid("json");
    return c.json(await sendAdminTestPush({ callerId: user.id, message }));
  },
```

Add `validator("json", notificationTestSendBodySchema, validationHook)` in place
of the `c.req.json().catch(() => ({}))` + `.parse()` pair. Remove the `getDb`,
schema-table, `drizzle-orm`, `ulid`, `ExpoPushClient` and `getRedis` imports.

- [ ] **Step 7: Update the web client**

`apps/web/src/components/admin/push-test-card.tsx:85`:

```ts
-        if (err.status === 400 && /no_devices/i.test(err.message)) {
+        if (err.code === "NO_DEVICES") {
```

Add a test to `push-test-card.test.tsx` asserting an `APIError` carrying
`code: "NO_DEVICES"` renders the `noDevicesError` toast. Without a `code` on the
body, `APIError.code` falls back to `"UNKNOWN_ERROR"`
(`packages/api-client/src/client.ts:172`), which is why the regex existed.

- [ ] **Step 8: Update the route test**

Import the real `TestPushError`; wire `errorHandler`; assert 400/`NO_DEVICES` and
that a 500/`PUSH_CHANNEL_MISSING` is reported. Mock `config/logger` to keep the
`AppError` 5xx branch from printing pino JSON through the suite.

- [ ] **Step 9: Run the workspace suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 10: Verify the #122 guard earns its place**

Change the service to insert one row per device, confirm the one-row test fails,
then restore.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/routes/admin/notification-test.routes.ts \
        apps/api/src/services/notifications/test-push.* \
        apps/api/src/routes/admin/notification-test.routes.test.ts \
        apps/web/src/components/admin/push-test-card.tsx \
        apps/web/src/components/admin/push-test-card.test.tsx
git commit -m "refactor(api): extract the admin test-push service

Moves the device fan-out, the aggregate notification_log row and its
transaction behind sendAdminTestPush, and replaces the inline Redis cooldown
with the shared rate limiter. The no_devices body gains a code, so the web
card matches err.code instead of the error message."
```

---

## Task 17: Slice 7 — assistant chat route

`qa.routes.ts` is the template: a gate middleware, `rateLimit`, `validator`, and a
bounded contract schema. The assistant route has none of them — its
`bodySchema.parse(await c.req.json())` 500s on malformed JSON, and
`z.array(z.unknown())` is unbounded.

**Files:**
- Create: `packages/contracts/src/assistant.ts` + `.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/routes/admin/assistant.routes.ts`
- Test: `apps/api/src/routes/admin/assistant.routes.test.ts`

**Interfaces:**
- Produces: `assistantRescheduleChatBodySchema` — the same bounded shape as
  `qaChatBodySchema` (`packages/contracts/src/qa.ts`), with `matchId` in place of
  `locale`, and the AI SDK transport envelope (`id`, `trigger`, `messageId`)
  declared.

**Do not omit the transport envelope.** `DefaultChatTransport.sendMessages`
appends `id`, `trigger` and (on `regenerate()`) `messageId`. The body is strict,
so leaving them out makes every real chat request a 400.

- [ ] **Step 1: Write the failing contract tests**

```ts
it("rejects more than 60 messages", () => {
  const messages = Array.from({ length: 61 }, () => ({ role: "user", parts: [] }));
  expect(assistantRescheduleChatBodySchema.safeParse({ messages }).success).toBe(false);
});

it("accepts the AI SDK transport envelope", () => {
  const result = assistantRescheduleChatBodySchema.safeParse({
    messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
    id: "chat-1",
    trigger: "submit-message",
  });
  expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Run and watch fail**

Run: `pnpm --filter @dragons/contracts test src/assistant.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the contract**

Copy the bounds and the two explanatory comments from `qa.ts` — `MAX_MESSAGES`
60, `MAX_PARTS_PER_MESSAGE` 20, `MAX_TEXT_CHARS` 8000, `looseObject` for parts
and messages, `strictObject` for the body — replacing `locale` with
`matchId: z.number().int().positive().optional()`.

- [ ] **Step 4: Rewrite the route to mirror `qa.routes.ts`**

```ts
assistantRoutes.post(
  "/assistant/reschedule/chat",
  async (c, next) => {
    if (!env.ASSISTANT_ENABLED) {
      return c.json({ error: "Assistant is disabled", code: "ASSISTANT_DISABLED" }, 503);
    }
    return next();
  },
  requirePermission("match", "update"),
  rateLimit({ limit: 20, windowSeconds: 60, keyPrefix: "assistant-reschedule" }),
  bodyLimit({ maxSize: 512 * 1024 }),
  validator("json", assistantRescheduleChatBodySchema, validationHook),
  describeRoute({ /* add 400 and 429 responses */ }),
  async (c) => {
    const { messages, matchId } = c.req.valid("json");
    return streamRescheduleChat(messages as UIMessage[], matchId);
  },
);
```

Delete the local `bodySchema`. The `as UIMessage[]` cast stays — the contract
validates an opaque bounded array and the AI SDK validates the full shape
downstream in `convertToModelMessages`, exactly as `qa.routes.ts` documents.

- [ ] **Step 5: Write the route tests**

Assert the 503 still fires when the flag is off, that malformed JSON is now 400
with `code: "VALIDATION_ERROR"` (Task 1 makes this true), and that a 61-message
body is rejected.

- [ ] **Step 6: Add a transport contract test**

Mirror `apps/api/src/routes/qa-chat-transport.contract.test.ts`: drive the real
`DefaultChatTransport` as the web copilot configures it and assert the body it
produces parses against `assistantRescheduleChatBodySchema`, so an AI SDK upgrade
fails the build rather than the chat.

- [ ] **Step 7: Run the workspace suite**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/admin/assistant.routes.ts \
        apps/api/src/routes/admin/assistant.routes.test.ts \
        packages/contracts/src/assistant.ts packages/contracts/src/assistant.test.ts \
        packages/contracts/src/index.ts
git commit -m "fix(api): bound and rate-limit the reschedule assistant chat

Mirrors qa.routes: the ASSISTANT_ENABLED gate becomes middleware, the body
validates through a bounded contract, and the route gains a rate limit and a
body limit. Malformed JSON returned 500; it now returns the shared 400."
```

---

## Task 18: Close-out

- [ ] **Step 1: Confirm no route touches the database**

```bash
cd apps/api/src/routes
grep -rln 'from "drizzle-orm"\|config/database' --include=*.ts . | grep -v '\.test\.'
```

Expected: only `health.routes.ts` (its direct access is the liveness probe).

- [ ] **Step 2: Confirm every input-taking route validates**

```bash
for f in $(find . -name '*.routes.ts' ! -name '*.test.ts'); do grep -q 'validator(' $f || echo "$f"; done
```

Expected: only the files listed as out of scope in the spec — `health`,
`admin/standings`, `public/standings`, `public/home`, `public/assets`,
`api/scoreboard`, `mcp`.

- [ ] **Step 3: Run every gate**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm coverage && pnpm build
pnpm check:coverage-scripts && pnpm check:design-tokens \
  && pnpm check:skipped-tests && pnpm check:ai-slop
npx knip
```

Expected: all pass. Lint warning baseline unchanged (native 15 / web 5 / api 15).

- [ ] **Step 4: Update `AGENTS.md` if any endpoint description drifted**

`apps/api/src/test/docs-drift.test.ts` compares the endpoint tables against the
Hono route tree in both directions. Extraction does not change routes, but the
400/404 descriptions in `describeRoute` may now say something different.

- [ ] **Step 5: Merge locally, then ask before pushing**

```bash
git checkout main
git merge --no-ff fix/issue-75-52
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # on the MERGED result
git branch -d fix/issue-75-52
```

A clean `git merge-tree` is not evidence of a safe merge — the gates must run on
the merge commit itself. Ask before pushing.

- [ ] **Step 6: Record the decisions on the issues**

Comment on #75 and #52 with the five spec decisions, the six intended behaviour
changes from the spec's table, and the verification record. The commit message is
not where anyone looks later.

---

## Behaviour changes to report when closing

| Change | Task | Risk |
|---|---|---|
| 404 bodies gain `code` | 7, 8, 10, 13 | Additive |
| `no_devices` → `code: "NO_DEVICES"`; web drops the regex | 16 | One web edit, covered by test |
| test-push 429 moves to the shared limiter; `Retry-After` becomes a constant 10 | 16 | No client reads it |
| `admin/sync` bad `limit`: silent clamp → 400 | 14 | No client sends it |
| Malformed JSON: `HTTP_ERROR` → `VALIDATION_ERROR` | 1 | Shared handler |
| Assistant: malformed JSON 500 → 400, array bounded, rate limit added | 17 | Very long chats now rejected |
