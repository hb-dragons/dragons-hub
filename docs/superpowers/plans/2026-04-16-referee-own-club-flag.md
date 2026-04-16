# Referee Own Club Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-managed `isOwnClub` boolean to referees so the system can distinguish club referees from opponents, gating all referee management features to own-club referees only.

**Architecture:** Add `isOwnClub` column to the `referees` table, expose it through the existing visibility PATCH endpoint and list GET endpoint, add guards in downstream services (visibility, rules, self-assign), and update the frontend with a filter toggle and settings panel.

**Tech Stack:** Drizzle ORM, Hono, Zod, Vitest, React/Next.js, SWR, next-intl, TanStack Table

---

### Task 1: Schema — Add `isOwnClub` column to referees table

**Files:**
- Modify: `packages/db/src/schema/referees.ts:14-25`
- Modify: `packages/shared/src/referees.ts:1-13` and `28-31`

- [ ] **Step 1: Add `isOwnClub` to the referees schema**

In `packages/db/src/schema/referees.ts`, add after the `allowAwayGames` line:

```ts
isOwnClub: boolean("is_own_club").notNull().default(false),
```

- [ ] **Step 2: Add `isOwnClub` to shared types**

In `packages/shared/src/referees.ts`, add `isOwnClub: boolean` to `RefereeListItem` (after `allowAwayGames`) and `UpdateRefereeVisibilityBody` (after `allowAwayGames`).

`RefereeListItem`:
```ts
export interface RefereeListItem {
  id: number;
  apiId: number;
  firstName: string | null;
  lastName: string | null;
  licenseNumber: number | null;
  matchCount: number;
  roles: string[];
  allowAllHomeGames: boolean;
  allowAwayGames: boolean;
  isOwnClub: boolean;
  createdAt: string;
  updatedAt: string;
}
```

`UpdateRefereeVisibilityBody`:
```ts
export interface UpdateRefereeVisibilityBody {
  allowAllHomeGames: boolean;
  allowAwayGames: boolean;
  isOwnClub: boolean;
}
```

- [ ] **Step 3: Generate Drizzle migration**

Run: `pnpm --filter @dragons/db db:generate`

Expected: A new migration file in `packages/db/drizzle/` adding `is_own_club boolean not null default false` to the `referees` table.

- [ ] **Step 4: Run migration**

Run: `pnpm --filter @dragons/db db:push`

Expected: Schema applied successfully.

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/referees.ts packages/shared/src/referees.ts packages/db/drizzle/
git commit -m "feat(db): add isOwnClub column to referees table"
```

---

### Task 2: API — Add `isOwnClub` to visibility endpoint and list query

**Files:**
- Modify: `apps/api/src/routes/admin/referee.schemas.ts`
- Modify: `apps/api/src/routes/admin/referee.routes.ts:31-34`
- Modify: `apps/api/src/services/admin/referee-admin.service.ts`

- [ ] **Step 1: Write failing tests for `isOwnClub` in GET and PATCH**

In `apps/api/src/routes/admin/referee.routes.test.ts`, add these tests:

In the `describe("GET /referees")` block, add:

```ts
it("defaults ownClub to true and passes to service", async () => {
  mocks.getReferees.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });

  await app.request("/referees");

  expect(mocks.getReferees).toHaveBeenCalledWith({ limit: 1000, offset: 0, ownClub: true });
});

it("passes ownClub=false when specified", async () => {
  mocks.getReferees.mockResolvedValue({ items: [], total: 0, limit: 1000, offset: 0, hasMore: false });

  await app.request("/referees?ownClub=false");

  expect(mocks.getReferees).toHaveBeenCalledWith({ limit: 1000, offset: 0, ownClub: false });
});
```

In the `describe("PATCH /referees/:id/visibility")` block, add:

```ts
it("passes isOwnClub in visibility update", async () => {
  const updated = { id: 1, allowAllHomeGames: true, allowAwayGames: false, isOwnClub: true };
  mocks.updateRefereeVisibility.mockResolvedValue(updated);

  const res = await app.request("/referees/1/visibility", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allowAllHomeGames: true, allowAwayGames: false, isOwnClub: true }),
  });

  expect(res.status).toBe(200);
  expect(await json(res)).toEqual(updated);
  expect(mocks.updateRefereeVisibility).toHaveBeenCalledWith(1, {
    allowAllHomeGames: true,
    allowAwayGames: false,
    isOwnClub: true,
  });
});

it("returns 400 when isOwnClub missing from visibility body", async () => {
  const res = await app.request("/referees/1/visibility", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allowAllHomeGames: true, allowAwayGames: false }),
  });

  expect(res.status).toBe(400);
  expect(await json(res)).toMatchObject({ code: "VALIDATION_ERROR" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @dragons/api test -- apps/api/src/routes/admin/referee.routes.test.ts`

Expected: 4 new tests fail (ownClub not in schema, isOwnClub not in body schema).

- [ ] **Step 3: Update the query schema**

In `apps/api/src/routes/admin/referee.schemas.ts`:

```ts
import { z } from "zod";

export const refereeListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().min(1).optional(),
  ownClub: z.coerce.boolean().default(true),
});

export type RefereeListQuery = z.infer<typeof refereeListQuerySchema>;
```

- [ ] **Step 4: Update the route to pass `ownClub` and `isOwnClub`**

In `apps/api/src/routes/admin/referee.routes.ts`:

Add `ownClub` to the query parsing:

```ts
const query = refereeListQuerySchema.parse({
  limit: c.req.query("limit"),
  offset: c.req.query("offset"),
  search: c.req.query("search"),
  ownClub: c.req.query("ownClub"),
});
```

Update the visibility body schema to include `isOwnClub`:

```ts
const visibilityBodySchema = z.object({
  allowAllHomeGames: z.boolean(),
  allowAwayGames: z.boolean(),
  isOwnClub: z.boolean(),
});
```

- [ ] **Step 5: Update the service**

In `apps/api/src/services/admin/referee-admin.service.ts`:

Add `ownClub` to `RefereeListParams`:

```ts
export interface RefereeListParams {
  limit: number;
  offset: number;
  search?: string;
  ownClub: boolean;
}
```

In `getReferees`, add the `ownClub` condition:

```ts
const conditions = [];
if (params.ownClub) {
  conditions.push(eq(referees.isOwnClub, true));
}
if (search) {
  conditions.push(
    or(
      ilike(referees.firstName, `%${search}%`),
      ilike(referees.lastName, `%${search}%`),
    ),
  );
}
```

Add `isOwnClub` to the select fields:

```ts
isOwnClub: referees.isOwnClub,
```

Add `isOwnClub` to the `items` mapping:

```ts
isOwnClub: row.isOwnClub,
```

In `updateRefereeVisibility`, add `isOwnClub` to the set and returning:

```ts
.set({
  allowAllHomeGames: body.allowAllHomeGames,
  allowAwayGames: body.allowAwayGames,
  isOwnClub: body.isOwnClub,
  updatedAt: new Date(),
})
.returning({
  id: referees.id,
  allowAllHomeGames: referees.allowAllHomeGames,
  allowAwayGames: referees.allowAwayGames,
  isOwnClub: referees.isOwnClub,
});
```

- [ ] **Step 6: Fix existing test expectations**

The existing test `"returns referee list with default limit of 1000"` and `"omits search when not provided"` expect `getReferees` to be called without `ownClub`. Update them:

```ts
expect(mocks.getReferees).toHaveBeenCalledWith({ limit: 1000, offset: 0, ownClub: true });
```

The existing test `"passes query params to service"` also needs updating:

```ts
expect(mocks.getReferees).toHaveBeenCalledWith({
  limit: 10,
  offset: 5,
  search: "Mueller",
  ownClub: true,
});
```

The existing visibility tests that send `{ allowAllHomeGames: true, allowAwayGames: false }` without `isOwnClub` will now fail validation (400). Update the valid tests to include `isOwnClub`:

For `"returns 200 and updates visibility flags"`:
```ts
body: JSON.stringify({ allowAllHomeGames: true, allowAwayGames: false, isOwnClub: false }),
```
and:
```ts
expect(mocks.updateRefereeVisibility).toHaveBeenCalledWith(1, {
  allowAllHomeGames: true,
  allowAwayGames: false,
  isOwnClub: false,
});
```

For `"returns 404 for non-existent referee"` and `"rethrows unexpected errors"`:
```ts
body: JSON.stringify({ allowAllHomeGames: true, allowAwayGames: false, isOwnClub: false }),
```

Keep the `"returns 400 for invalid body"` test as-is (sends `{ allowAllHomeGames: "yes" }` which is still invalid).

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- apps/api/src/routes/admin/referee.routes.test.ts`

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/admin/referee.schemas.ts apps/api/src/routes/admin/referee.routes.ts apps/api/src/services/admin/referee-admin.service.ts apps/api/src/routes/admin/referee.routes.test.ts
git commit -m "feat(api): add isOwnClub to referee list query and visibility endpoint"
```

---

### Task 3: Guards — Visibility service `isOwnClub` check

**Files:**
- Modify: `apps/api/src/services/referee/referee-game-visibility.service.ts:29-51`
- Modify: `apps/api/src/services/referee/referee-game-visibility.service.test.ts`

- [ ] **Step 1: Write failing test**

In `apps/api/src/services/referee/referee-game-visibility.service.test.ts`, add `isOwnClub` to the mock schema:

```ts
referees: {
  id: "ref.id",
  allowAllHomeGames: "ref.allowAllHomeGames",
  allowAwayGames: "ref.allowAwayGames",
  isOwnClub: "ref.isOwnClub",
},
```

Update `setupMocks` to accept and return `isOwnClub`:

```ts
function setupMocks(
  referee: { allowAllHomeGames: boolean; allowAwayGames: boolean; isOwnClub: boolean } | null,
  rules: Array<{ teamId: number; deny: boolean; allowSr1: boolean; allowSr2: boolean }>,
  items: unknown[] = [],
  count = 0,
) {
```

Add the test:

```ts
it("returns empty when referee is not own club", async () => {
  setupMocks({ allowAllHomeGames: true, allowAwayGames: true, isOwnClub: false }, []);

  const result = await getVisibleRefereeGames(1, defaultParams);

  expect(result).toEqual({
    items: [],
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  });
});
```

Update all existing `setupMocks` calls to include `isOwnClub: true` in the referee object. For example:

```ts
setupMocks({ allowAllHomeGames: false, allowAwayGames: false, isOwnClub: true }, []);
setupMocks({ allowAllHomeGames: true, allowAwayGames: false, isOwnClub: true }, []);
// etc.
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run: `pnpm --filter @dragons/api test -- apps/api/src/services/referee/referee-game-visibility.service.test.ts`

Expected: The `"returns empty when referee is not own club"` test fails (returns games instead of empty).

- [ ] **Step 3: Add the `isOwnClub` guard**

In `apps/api/src/services/referee/referee-game-visibility.service.ts`, update the referee select to include `isOwnClub`:

```ts
const [referee] = await db
  .select({
    allowAllHomeGames: referees.allowAllHomeGames,
    allowAwayGames: referees.allowAwayGames,
    isOwnClub: referees.isOwnClub,
  })
  .from(referees)
  .where(eq(referees.id, refereeId));
```

Add the guard right after the `if (!referee)` check:

```ts
if (!referee) {
  return { items: [], total: 0, limit, offset, hasMore: false };
}

if (!referee.isOwnClub) {
  return { items: [], total: 0, limit, offset, hasMore: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- apps/api/src/services/referee/referee-game-visibility.service.test.ts`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/referee/referee-game-visibility.service.ts apps/api/src/services/referee/referee-game-visibility.service.test.ts
git commit -m "feat(api): guard visibility service on isOwnClub"
```

---

### Task 4: Guards — Rules routes `isOwnClub` check

**Files:**
- Modify: `apps/api/src/routes/admin/referee-rules.routes.ts`
- Modify: `apps/api/src/routes/admin/referee-rules.routes.test.ts`

- [ ] **Step 1: Write failing tests**

In `apps/api/src/routes/admin/referee-rules.routes.test.ts`:

Update the schema mock to include `referees`:

```ts
vi.mock("@dragons/db/schema", () => ({
  teams: { id: "t.id", isOwnClub: "t.isOwnClub" },
  referees: { id: "r.id", isOwnClub: "r.isOwnClub" },
}));
```

The current `mocks.dbSelect` mock returns a chain for team validation. Now we need to handle two sequential `db.select()` calls: first the referee lookup (with `.limit()`), then team validation. Replace the `db` mock to use `mockReturnValueOnce` chaining:

```ts
vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mocks.dbSelect(...args),
  },
}));
```

The mock stays the same, but test setup changes. For tests that hit the guard, configure `mocks.dbSelect` with `mockReturnValueOnce` for the referee lookup (chain: `from → where → limit`), then `mockReturnValueOnce` for the team validation (chain: `from → where`).

Helper for the referee lookup chain:

```ts
function refereeLookupChain(result: unknown[]) {
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(result) }) }) };
}
```

Add tests:

```ts
describe("GET /referees/:id/rules — isOwnClub guard", () => {
  it("returns 400 when referee is not own club", async () => {
    mocks.dbSelect.mockReturnValueOnce(refereeLookupChain([{ isOwnClub: false }]));

    const res = await app.request("/referees/1/rules");

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "NOT_OWN_CLUB" });
  });

  it("returns 404 when referee not found", async () => {
    mocks.dbSelect.mockReturnValueOnce(refereeLookupChain([]));

    const res = await app.request("/referees/1/rules");

    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("PUT /referees/:id/rules — isOwnClub guard", () => {
  it("returns 400 when referee is not own club", async () => {
    mocks.dbSelect.mockReturnValueOnce(refereeLookupChain([{ isOwnClub: false }]));

    const res = await app.request("/referees/1/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: [] }),
    });

    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "NOT_OWN_CLUB" });
  });
});
```

Update existing tests that reach past the guard to add a referee lookup mock first. For each existing GET test:

```ts
mocks.dbSelect.mockReturnValueOnce(refereeLookupChain([{ isOwnClub: true }]));
```

For existing PUT tests that use `mocks.dbSelect.mockReturnValue(...)` for team validation, change to chain both:

```ts
mocks.dbSelect
  .mockReturnValueOnce(refereeLookupChain([{ isOwnClub: true }]))
  .mockReturnValueOnce({ from: () => ({ where: () => [{ id: 42 }] }) });
```

For PUT tests that don't reach team validation (e.g. validation errors, empty rules), only the referee lookup is needed:

```ts
mocks.dbSelect.mockReturnValueOnce(refereeLookupChain([{ isOwnClub: true }]));
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `pnpm --filter @dragons/api test -- apps/api/src/routes/admin/referee-rules.routes.test.ts`

Expected: New guard tests fail.

- [ ] **Step 3: Add the guard to both routes**

In `apps/api/src/routes/admin/referee-rules.routes.ts`, add imports:

```ts
import { db } from "../../config/database";
import { teams, referees } from "@dragons/db/schema";
import { inArray, eq, and } from "drizzle-orm";
```

Add a helper function at the top of the file (after imports):

```ts
async function requireOwnClubReferee(id: number) {
  const [referee] = await db
    .select({ isOwnClub: referees.isOwnClub })
    .from(referees)
    .where(eq(referees.id, id))
    .limit(1);
  return referee;
}
```

In the GET handler, add at the top:

```ts
refereeRulesRoutes.get("/referees/:id/rules", async (c) => {
  const { id } = refereeRulesParamSchema.parse({ id: c.req.param("id") });

  const referee = await requireOwnClubReferee(id);
  if (!referee) {
    return c.json({ error: "Referee not found", code: "NOT_FOUND" }, 404);
  }
  if (!referee.isOwnClub) {
    return c.json({ error: "Referee is not an own-club referee", code: "NOT_OWN_CLUB" }, 400);
  }

  const result = await getRulesForReferee(id);
  return c.json(result);
});
```

In the PUT handler, add the same guard after param parsing:

```ts
refereeRulesRoutes.put("/referees/:id/rules", async (c) => {
  const { id } = refereeRulesParamSchema.parse({ id: c.req.param("id") });

  const referee = await requireOwnClubReferee(id);
  if (!referee) {
    return c.json({ error: "Referee not found", code: "NOT_FOUND" }, 404);
  }
  if (!referee.isOwnClub) {
    return c.json({ error: "Referee is not an own-club referee", code: "NOT_OWN_CLUB" }, 400);
  }

  const body = updateRefereeRulesBodySchema.parse(await c.req.json());
  // ... rest of handler
```

Note: update the import to use `referees` from `@dragons/db/schema` (it already imports `teams` — just add `referees`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- apps/api/src/routes/admin/referee-rules.routes.test.ts`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/referee-rules.routes.ts apps/api/src/routes/admin/referee-rules.routes.test.ts
git commit -m "feat(api): guard referee rules routes on isOwnClub"
```

---

### Task 5: Guards — Self-assign `isOwnClub` check

**Files:**
- Modify: `apps/api/src/routes/referee/assignment.routes.ts:52-73`
- Modify: `apps/api/src/routes/referee/assignment.routes.test.ts`

- [ ] **Step 1: Write failing test**

In `apps/api/src/routes/referee/assignment.routes.test.ts`, update the schema mock to include `isOwnClub`:

```ts
vi.mock("@dragons/db/schema", () => ({
  referees: { id: "r.id", apiId: "r.apiId", isOwnClub: "r.isOwnClub" },
  user: { id: "u.id", refereeId: "u.refereeId" },
}));
```

Add the test (within the existing describe block or a new one):

```ts
it("returns 403 when referee is not own club", async () => {
  mocks.getSession.mockResolvedValue({
    user: { id: "user1", role: "referee" },
  });
  // First select: user lookup returns refereeId
  // Second select: referee lookup returns apiId match but isOwnClub=false
  mocks.dbSelect
    .mockResolvedValueOnce([{ refereeId: 10 }])
    .mockResolvedValueOnce([{ apiId: 555, isOwnClub: false }]);

  const res = await app.request("/games/123/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotNumber: 1, refereeApiId: 555 }),
  });

  expect(res.status).toBe(403);
  expect(await json(res)).toMatchObject({ code: "NOT_OWN_CLUB" });
});
```

Update existing tests that mock the referee lookup to include `isOwnClub: true`:

```ts
.mockResolvedValueOnce([{ apiId: 555, isOwnClub: true }]);
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run: `pnpm --filter @dragons/api test -- apps/api/src/routes/referee/assignment.routes.test.ts`

Expected: The `"returns 403 when referee is not own club"` test fails.

- [ ] **Step 3: Add the guard**

In `apps/api/src/routes/referee/assignment.routes.ts`, update the referee select to include `isOwnClub`:

```ts
const [refereeRow] = await db
  .select({ apiId: referees.apiId, isOwnClub: referees.isOwnClub })
  .from(referees)
  .where(eq(referees.id, userRow.refereeId))
  .limit(1);
```

After the `apiId` check, add:

```ts
if (!refereeRow || refereeRow.apiId !== refereeApiId) {
  return c.json({ error: "Cannot assign another referee", code: "FORBIDDEN" }, 403);
}

if (!refereeRow.isOwnClub) {
  return c.json({ error: "Referee is not an own-club referee", code: "NOT_OWN_CLUB" }, 403);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @dragons/api test -- apps/api/src/routes/referee/assignment.routes.test.ts`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/referee/assignment.routes.ts apps/api/src/routes/referee/assignment.routes.test.ts
git commit -m "feat(api): guard referee self-assign on isOwnClub"
```

---

### Task 6: Run full API test suite and coverage

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm --filter @dragons/api test`

Expected: All tests pass.

- [ ] **Step 2: Run coverage**

Run: `pnpm --filter @dragons/api coverage`

Expected: Coverage thresholds met (90% branches, 95% functions/lines/statements).

- [ ] **Step 3: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`

Expected: No errors.

- [ ] **Step 4: Commit if any fixups were needed**

Only if changes were made to fix issues found above.

---

### Task 7: Frontend — Add `isOwnClub` filter to referee table

**Files:**
- Modify: `apps/web/src/lib/swr-keys.ts:14`
- Modify: `apps/web/src/components/admin/referees/referee-list-table.tsx`
- Modify: `apps/web/src/messages/en.json` (referees section)
- Modify: `apps/web/src/messages/de.json` (referees section)

- [ ] **Step 1: Add parameterized SWR key**

In `apps/web/src/lib/swr-keys.ts`, change the `referees` key from a static string to a function:

```ts
referees: (ownClub?: boolean) =>
  `/admin/referees${ownClub === false ? "?ownClub=false" : ""}`,
```

- [ ] **Step 2: Add i18n keys**

In `apps/web/src/messages/en.json`, add to the `referees` object:

```json
"filter": {
  "ownClub": "Own Club",
  "all": "All"
},
"columns": {
  ...existing columns...,
  "isOwnClub": "Own Club"
}
```

In `apps/web/src/messages/de.json`, add the equivalent:

```json
"filter": {
  "ownClub": "Eigener Verein",
  "all": "Alle"
},
"columns": {
  ...existing columns...,
  "isOwnClub": "Eigener Verein"
}
```

- [ ] **Step 3: Add the filter and column to the table**

In `apps/web/src/components/admin/referees/referee-list-table.tsx`:

Add state for the filter:

```ts
const [showOwnClub, setShowOwnClub] = useState(true)
```

Update the SWR call to use the parameterized key:

```ts
const { data: response } = useSWR<PaginatedResponse<RefereeListItem>>(
  SWR_KEYS.referees(showOwnClub ? undefined : false),
  apiFetcher,
)
```

Add a `Check` import from lucide-react:

```ts
import { SearchIcon, Settings2, Users, Check } from "lucide-react"
```

Add the `isOwnClub` column (before the `actions` column):

```ts
{
  accessorKey: "isOwnClub",
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title={t("columns.isOwnClub")} />
  ),
  cell: ({ row }) =>
    row.original.isOwnClub ? (
      <Check className="h-4 w-4 text-emerald-600" />
    ) : null,
  meta: { label: t("columns.isOwnClub") },
},
```

Add a filter chip component inline (same pattern as `FacetChips` in referee-games-list):

```tsx
<div className="flex gap-1">
  {([
    { label: t("filter.ownClub"), value: true },
    { label: t("filter.all"), value: false },
  ] as const).map((opt) => (
    <button
      key={String(opt.value)}
      type="button"
      onClick={() => setShowOwnClub(opt.value)}
      className={cn(
        "rounded-4xl border px-3 py-1 text-xs transition-colors",
        showOwnClub === opt.value
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
    >
      {opt.label}
    </button>
  ))}
</div>
```

Add this inside the `DataTableToolbar` after the search input.

Import `cn` if not already imported:

```ts
import { cn } from "@dragons/ui/lib/utils"
```

Update `initialColumnVisibility` to hide `isOwnClub` by default:

```ts
initialColumnVisibility={{ apiId: false, isOwnClub: false }}
```

- [ ] **Step 4: Update SWR key references**

Search for other uses of `SWR_KEYS.referees` and update them. The `referee-rules-dialog.tsx` doesn't use it directly (it uses `SWR_KEYS.refereeRules(id)`). Check if any `mutate(SWR_KEYS.referees)` calls exist and update them.

Run: `grep -r "SWR_KEYS.referees[^G^R]" apps/web/src/` to find references.

If `mutate(SWR_KEYS.referees)` exists in any file, update to use a pattern matcher or the specific key.

- [ ] **Step 5: Verify typecheck**

Run: `pnpm typecheck`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/swr-keys.ts apps/web/src/components/admin/referees/referee-list-table.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): add own-club filter and column to referee table"
```

---

### Task 8: Frontend — Add visibility toggles to referee rules dialog

**Files:**
- Modify: `apps/web/src/components/admin/referees/referee-rules-dialog.tsx`
- Modify: `apps/web/src/messages/en.json` (referees.rules section)
- Modify: `apps/web/src/messages/de.json` (referees.rules section)

- [ ] **Step 1: Add i18n keys**

In `apps/web/src/messages/en.json`, add to `referees.rules`:

```json
"visibility": {
  "title": "Settings",
  "ownClub": "Own Club Referee",
  "ownClubDescription": "This referee belongs to our club",
  "allHomeGames": "All Home Games",
  "allHomeGamesDescription": "Show all home games (except denied teams)",
  "awayGames": "Away Games",
  "awayGamesDescription": "Show away games"
}
```

In `apps/web/src/messages/de.json`, add the equivalent:

```json
"visibility": {
  "title": "Einstellungen",
  "ownClub": "Eigener Vereins-Schiedsrichter",
  "ownClubDescription": "Dieser Schiedsrichter gehört zu unserem Verein",
  "allHomeGames": "Alle Heimspiele",
  "allHomeGamesDescription": "Alle Heimspiele anzeigen (außer gesperrte Teams)",
  "awayGames": "Auswärtsspiele",
  "awayGamesDescription": "Auswärtsspiele anzeigen"
}
```

- [ ] **Step 2: Add visibility state and save logic**

In `apps/web/src/components/admin/referees/referee-rules-dialog.tsx`:

Add visibility state:

```ts
const [visibility, setVisibility] = useState({
  isOwnClub: false,
  allowAllHomeGames: false,
  allowAwayGames: false,
})
```

Sync visibility from the referee prop when dialog opens:

```ts
useEffect(() => {
  if (referee && open) {
    setVisibility({
      isOwnClub: referee.isOwnClub,
      allowAllHomeGames: referee.allowAllHomeGames,
      allowAwayGames: referee.allowAwayGames,
    })
  }
}, [referee, open])
```

Add a `Label` import:

```ts
import { Label } from "@dragons/ui/components/label"
```

Update `handleSave` to also save visibility:

```ts
async function handleSave() {
  if (!referee) return

  const validRules = rules.filter(
    (r) => r.teamId !== null && (r.deny || r.allowSr1 || r.allowSr2),
  )

  setSubmitting(true)
  try {
    await Promise.all([
      fetchAPI(`/admin/referees/${referee.id}/rules`, {
        method: "PUT",
        body: JSON.stringify({
          rules: validRules.map((r) => ({
            teamId: r.teamId,
            deny: r.deny,
            allowSr1: r.deny ? false : r.allowSr1,
            allowSr2: r.deny ? false : r.allowSr2,
          })),
        }),
      }),
      fetchAPI(`/admin/referees/${referee.id}/visibility`, {
        method: "PATCH",
        body: JSON.stringify(visibility),
      }),
    ])

    toast.success(t("rules.saved"))
    await Promise.all([
      mutate(SWR_KEYS.refereeRules(referee.id)),
      mutate((key: string) => typeof key === "string" && key.startsWith("/admin/referees"), undefined, { revalidate: true }),
    ])
    onOpenChange(false)
  } catch {
    toast.error(t("rules.saveFailed"))
  } finally {
    setSubmitting(false)
  }
}
```

- [ ] **Step 3: Add visibility UI section**

In the dialog content, add above the rules `<div className="space-y-3">`:

```tsx
<div className="space-y-4 border-b pb-4">
  <h4 className="text-sm font-medium">{t("rules.visibility.title")}</h4>

  <div className="flex items-center justify-between gap-4">
    <div>
      <Label className="text-sm">{t("rules.visibility.ownClub")}</Label>
      <p className="text-xs text-muted-foreground">{t("rules.visibility.ownClubDescription")}</p>
    </div>
    <Switch
      checked={visibility.isOwnClub}
      onCheckedChange={(checked) => setVisibility((v) => ({ ...v, isOwnClub: checked }))}
    />
  </div>

  <div className="flex items-center justify-between gap-4">
    <div>
      <Label className="text-sm">{t("rules.visibility.allHomeGames")}</Label>
      <p className="text-xs text-muted-foreground">{t("rules.visibility.allHomeGamesDescription")}</p>
    </div>
    <Switch
      checked={visibility.allowAllHomeGames}
      onCheckedChange={(checked) => setVisibility((v) => ({ ...v, allowAllHomeGames: checked }))}
    />
  </div>

  <div className="flex items-center justify-between gap-4">
    <div>
      <Label className="text-sm">{t("rules.visibility.awayGames")}</Label>
      <p className="text-xs text-muted-foreground">{t("rules.visibility.awayGamesDescription")}</p>
    </div>
    <Switch
      checked={visibility.allowAwayGames}
      onCheckedChange={(checked) => setVisibility((v) => ({ ...v, allowAwayGames: checked }))}
    />
  </div>
</div>
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm typecheck`

Expected: No errors.

- [ ] **Step 5: Start dev server and test in browser**

Run: `pnpm dev`

Test:
1. Navigate to `/admin/referees`
2. Verify the "Own Club" / "All" filter chips appear in the toolbar
3. Click "All" — should show all referees
4. Click "Own Club" — should show only own-club referees (likely empty initially)
5. Click the settings icon on a referee row — dialog opens
6. Verify the three switches (Own Club, All Home Games, Away Games) appear at the top
7. Toggle "Own Club" on, click Save
8. Verify the referee now appears when filtering by "Own Club"
9. Verify the `isOwnClub` column can be shown via column visibility dropdown

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin/referees/referee-rules-dialog.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): add visibility settings to referee rules dialog"
```

---

### Task 9: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the referee section in AGENTS.md**

Add `isOwnClub` to the referees table documentation, the `PATCH /admin/referees/:id/visibility` endpoint docs, and the `GET /admin/referees` query params. Note the `isOwnClub` guard on rules routes and self-assign.

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with referee isOwnClub flag"
```

---

### Task 10: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`

Expected: All tests pass.

- [ ] **Step 2: Run coverage**

Run: `pnpm coverage`

Expected: Thresholds met.

- [ ] **Step 3: Run lint, typecheck, and slop check**

Run: `pnpm lint && pnpm typecheck && pnpm check:ai-slop`

Expected: All pass.

- [ ] **Step 4: Verify dev server runs**

Run: `pnpm dev`

Test the full flow in browser one more time:
1. Filter toggle works
2. Settings dialog saves visibility
3. Own-club referee can access games
4. Non-own-club referee cannot
