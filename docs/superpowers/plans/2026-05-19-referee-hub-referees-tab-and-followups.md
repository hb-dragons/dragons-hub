# Referee Hub — Referees Tab & Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Referees tab redesign (server-driven list with Own/All scope, split Profile/Rules subtabs with explicit Rules save, History role-detection fix), the Open Slots polish carryover (inline assignment errors, server-side slot status filter, autosized list, TZ-aware SSR), and the follow-up cleanups (dead exports, i18n keys, shared types).

**Architecture:** API gains one new endpoint (`GET /admin/referees/:id`), one new query param (`slotStatus`), and Zod validation on `/referee/games`; eligible-open-games is parallelized. Web promotes search/sort to URL state, adds a single-referee SWR key, splits the autosaving `ProfileSubtab` into autosaving `ProfileSubtab` + explicit-save `RulesSubtab`, and replaces ad-hoc client-side slot filtering with the new server param. SSR date defaults move to `Europe/Berlin` so they match the client SWR cache key. Knip-flagged dead exports and unused i18n keys are removed.

**Tech Stack:** Hono 4.12 + Zod 4.3 + Drizzle 0.45 (API). Next.js 16.2 + SWR + react-window (web). next-intl, Radix UI primitives, sonner. Vitest v4. `p-limit` (already in `apps/api`).

**Parent spec:** [`docs/superpowers/specs/2026-05-19-referee-hub-referees-tab-and-followups-design.md`](../specs/2026-05-19-referee-hub-referees-tab-and-followups-design.md)

---

## File map

### Created
- `apps/web/src/components/admin/referee-hub/referees/rules-subtab.tsx` — explicit-save Rules subtab.
- `apps/web/src/components/admin/referee-hub/referees/rules-subtab.test.tsx` — tests for above.
- `apps/web/src/components/admin/referee-hub/referees/referee-detail.test.tsx` — tests for fetch-by-id detail.
- `apps/web/src/components/admin/referee-hub/referees/history-subtab.test.tsx` — tests for role detection + load-more.
- `apps/web/src/components/admin/referee-hub/open-slots/slot-card.test.tsx` — tests for inline error chip.

### Modified — API
- `packages/shared/src/referees.ts` — add `EligibleOpenGamesResponse`.
- `packages/shared/src/index.ts` — re-export `EligibleOpenGamesResponse`.
- `packages/shared/src/referee-history.ts` — add `sr1RefereeApiId`, `sr2RefereeApiId` to `HistoryGameItem`.
- `apps/api/src/services/admin/referee-admin.service.ts` — drop `export` on `RefereeScope`/`RefereeSort`; add `getRefereeById`.
- `apps/api/src/services/admin/referee-admin.service.test.ts` — test `getRefereeById`.
- `apps/api/src/routes/admin/referee.routes.ts` — add `GET /referees/:id`.
- `apps/api/src/services/referee/referee-games.service.ts` — add `slotStatus` param.
- `apps/api/src/services/referee/referee-games.service.test.ts` — test `slotStatus`.
- `apps/api/src/routes/referee/games.routes.ts` — Zod schema for `/games`, including `slotStatus`.
- `apps/api/src/routes/referee/games.routes.test.ts` — schema validation tests (file may not exist yet — created in T3 if needed).
- `apps/api/src/services/admin/referee-history.service.ts` — select `sr1RefereeApiId`/`sr2RefereeApiId`.
- `apps/api/src/services/referee/eligible-open-games.service.ts` — import shared type; parallelize with `p-limit`.
- `apps/api/src/services/referee/eligible-open-games.service.test.ts` — assert parallel processing preserves order.

### Modified — Web
- `apps/web/src/components/admin/referee-hub/use-referee-hub-url.ts` — add `search`, `sort` to state; drop `export` on `HubStatus`/`HubGameType`/`HubScope`.
- `apps/web/src/components/admin/referee-hub/use-referee-hub-url.test.ts` — extend for new params.
- `apps/web/src/lib/swr-keys.ts` — add `referee(id)`.
- `apps/web/src/app/[locale]/admin/referees/page.tsx` — Europe/Berlin TZ for SSR date defaults.
- `apps/web/src/components/admin/referee-hub/referees/referee-list.tsx` — server-driven scope/search/sort + scope chip + 2-card KPI.
- `apps/web/src/components/admin/referee-hub/referees/referee-list.test.tsx` — extend.
- `apps/web/src/components/admin/referee-hub/referees/referee-detail.tsx` — fetch by id; Rules TabsTrigger; dirty-guard wrapper.
- `apps/web/src/components/admin/referee-hub/referees/profile-subtab.tsx` — strip Rules section.
- `apps/web/src/components/admin/referee-hub/referees/profile-subtab.test.tsx` — drop rules-related skipped cases.
- `apps/web/src/components/admin/referee-hub/referees/history-subtab.tsx` — apiId role detection + load-more.
- `apps/web/src/components/admin/referee-hub/open-slots/slot-card.tsx` — inline error chip; remove toasts.
- `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx` — send `slotStatus`; drop client post-filter; container height with `useResizeObserver`.
- `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.test.tsx` — extend.
- `apps/web/src/messages/en.json`, `apps/web/src/messages/de.json`, `apps/web/src/messages/en.d.json.ts` — remove `referees.columns.roles`, remove slot-card toast keys.

---

## Conventions used in this plan

- Run an API test file: `pnpm --filter @dragons/api test -- <relative-path>` (Vitest filters by path substring).
- Run a web test file: `pnpm --filter @dragons/web test -- <relative-path>`.
- Run all package tests + typecheck before each commit when the change spans surfaces.
- Commits never include `Co-Authored-By` or AI credit trailers. Plain conventional commits.

---

## API layer

### Task 1: Move `EligibleOpenGamesResponse` to `@dragons/shared`

**Files:**
- Modify: `packages/shared/src/referees.ts` (append after existing exports)
- Modify: `packages/shared/src/index.ts` (re-export through the barrel)
- Modify: `apps/api/src/services/referee/eligible-open-games.service.ts` (import from shared, drop local declaration)
- Modify: `apps/api/src/routes/admin/referee-eligible-games.routes.ts` (if it imports the type locally)

- [ ] **Step 1: Move the type into shared**

Append to `packages/shared/src/referees.ts`:

```ts
import type { RefereeGameListItem } from "./referee-games";

export interface EligibleOpenGamesResponse {
  items: RefereeGameListItem[];
}
```

(If `RefereeGameListItem` already lives in this file, drop the import line and use the local symbol.)

Add the re-export in `packages/shared/src/index.ts`:

```ts
export type { EligibleOpenGamesResponse } from "./referees";
```

- [ ] **Step 2: Update the API service to import from shared**

In `apps/api/src/services/referee/eligible-open-games.service.ts`:

```ts
import { getRefereeGames } from "./referee-games.service";
import { searchCandidates } from "./referee-assignment.service";
import { isRefereeEligibleForGame } from "./referee-slot-resolver";
import type { EligibleOpenGamesResponse, RefereeGameListItem } from "@dragons/shared";

// remove the local `export interface EligibleOpenGamesResponse { ... }` block
```

If `apps/api/src/routes/admin/referee-eligible-games.routes.ts` imports the type from the service, switch it to `import type { EligibleOpenGamesResponse } from "@dragons/shared"`.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS across all packages.

- [ ] **Step 4: Run shared + api test suites**

Run: `pnpm --filter @dragons/shared test && pnpm --filter @dragons/api test -- eligible-open-games`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/referees.ts packages/shared/src/index.ts apps/api/src/services/referee/eligible-open-games.service.ts apps/api/src/routes/admin/referee-eligible-games.routes.ts
git commit -m "refactor(shared): host EligibleOpenGamesResponse next to referee types"
```

---

### Task 2: Add `slotStatus` filter to `getRefereeGames`

**Files:**
- Modify: `apps/api/src/services/referee/referee-games.service.ts`
- Test: `apps/api/src/services/referee/referee-games.service.test.ts`

- [ ] **Step 1: Write failing tests for `slotStatus`**

Add to the existing `describe("getRefereeGames", ...)` block in `referee-games.service.test.ts`:

```ts
it("slotStatus=open returns rows where sr1 OR sr2 is open", async () => {
  const result = await getRefereeGames({ limit: 100, offset: 0, slotStatus: "open" });
  for (const g of result.items) {
    expect(g.sr1Status === "open" || g.sr2Status === "open").toBe(true);
  }
});

it("slotStatus=offered returns rows where sr1 OR sr2 is open or offered", async () => {
  const result = await getRefereeGames({ limit: 100, offset: 0, slotStatus: "offered" });
  for (const g of result.items) {
    const ok =
      g.sr1Status === "open" || g.sr2Status === "open" ||
      g.sr1Status === "offered" || g.sr2Status === "offered";
    expect(ok).toBe(true);
  }
});

it("slotStatus=any composes with status=active and excludes cancelled/forfeited", async () => {
  const result = await getRefereeGames({ limit: 100, offset: 0, status: "active", slotStatus: "any" });
  for (const g of result.items) {
    expect(g.isCancelled).toBe(false);
    expect(g.isForfeited).toBe(false);
  }
});
```

Follow the mocking pattern already used in the file (look at how existing tests mock the drizzle chain).

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @dragons/api test -- referee-games.service`
Expected: 3 new tests fail with type/compile error or with "expected open|offered, got assigned" assertion.

- [ ] **Step 3: Implement `slotStatus`**

In `apps/api/src/services/referee/referee-games.service.ts`:

1. Add `slotStatus?: "open" | "offered" | "any"` to the params interface.
2. In the conditions builder, after the existing `gameType`/`league`/`dateFrom`/`dateTo` clauses:

```ts
if (slotStatus === "open") {
  conditions.push(
    or(eq(refereeGames.sr1Status, "open"), eq(refereeGames.sr2Status, "open"))!,
  );
} else if (slotStatus === "offered") {
  conditions.push(
    or(
      eq(refereeGames.sr1Status, "open"),
      eq(refereeGames.sr2Status, "open"),
      eq(refereeGames.sr1Status, "offered"),
      eq(refereeGames.sr2Status, "offered"),
    )!,
  );
}
// slotStatus === "any" or undefined: no extra clause
```

3. Pull `slotStatus` out of the params destructure at the top of the function.

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm --filter @dragons/api test -- referee-games.service`
Expected: PASS (full file).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/referee/referee-games.service.ts apps/api/src/services/referee/referee-games.service.test.ts
git commit -m "feat(api): add slotStatus filter to referee-games for slot-level visibility"
```

---

### Task 3: Zod schema for `/referee/games` (and `/referee/games/by-api-match/:id`)

**Files:**
- Modify: `apps/api/src/routes/referee/games.routes.ts`
- Test: `apps/api/src/routes/referee/games.routes.test.ts` (create if missing)

- [ ] **Step 1: Confirm or create the test file**

If `apps/api/src/routes/referee/games.routes.test.ts` does not yet exist, create it with the standard setup mirroring other route tests in `apps/api/src/routes/referee/` (look at an existing route test for the import boilerplate, the `app = new Hono()` mounting, and the `runInDb` / mock conventions).

- [ ] **Step 2: Write failing schema tests**

Append (or add) inside the route file's describe block:

```ts
it("rejects gameType outside enum with 400", async () => {
  const res = await app.request("/games?gameType=invalid", { method: "GET" }, /* env */);
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.code).toBe("VALIDATION_ERROR");
});

it("rejects slotStatus outside enum with 400", async () => {
  const res = await app.request("/games?slotStatus=bogus", { method: "GET" });
  expect(res.status).toBe(400);
});

it("rejects limit > 500 with 400", async () => {
  const res = await app.request("/games?limit=9999", { method: "GET" });
  expect(res.status).toBe(400);
});

it("accepts and clamps default values", async () => {
  const res = await app.request("/games", { method: "GET" });
  expect(res.status).toBe(200);
});

it("propagates slotStatus to the service", async () => {
  const spy = vi.spyOn(visibilityService, "getVisibleRefereeGames");
  await app.request("/games?slotStatus=offered", { method: "GET" });
  expect(spy).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ slotStatus: "offered" }),
  );
});
```

(Adapt the `app.request` env / RBAC bypass to whatever pattern already works in `referee-eligible-games.routes.test.ts` or `referee-assignment.routes.test.ts`.)

- [ ] **Step 3: Run, expect failure**

Run: `pnpm --filter @dragons/api test -- routes/referee/games`
Expected: assertions fail — invalid input currently 200s through the ad-hoc `c.req.query` casts.

- [ ] **Step 4: Replace ad-hoc parsing with Zod schema**

In `apps/api/src/routes/referee/games.routes.ts`, between the imports and `const refereeGamesRoutes`:

```ts
import { z } from "zod";

const gamesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().min(1).optional(),
  status: z.enum(["active", "cancelled", "forfeited", "all"]).default("active"),
  league: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined)),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  gameType: z.enum(["home", "away", "both"]).optional(),
  assignedRefereeApiId: z.coerce.number().int().positive().optional(),
  slotStatus: z.enum(["open", "offered", "any"]).optional(),
});
```

Replace the `refereeGamesRoutes.get("/games", ...)` handler body with:

```ts
refereeGamesRoutes.get("/games", gate, async (c) => {
  const parsed = gamesQuerySchema.safeParse({
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
    search: c.req.query("search"),
    status: c.req.query("status"),
    league: c.req.query("league"),
    dateFrom: c.req.query("dateFrom"),
    dateTo: c.req.query("dateTo"),
    gameType: c.req.query("gameType"),
    assignedRefereeApiId: c.req.query("assignedRefereeApiId"),
    slotStatus: c.req.query("slotStatus"),
  });
  if (!parsed.success) {
    return c.json(
      { error: "Invalid query parameters", code: "VALIDATION_ERROR", issues: parsed.error.flatten() },
      400,
    );
  }
  const refereeId = c.get("refereeId") ?? null;
  const result = await getVisibleRefereeGames(refereeId, parsed.data);
  return c.json(result);
});
```

Update `getVisibleRefereeGames` (in `referee-game-visibility.service.ts`) and its inner `getRefereeGames` call site to pass `slotStatus` through. If the visibility service's params type does not include `slotStatus`, add it (`slotStatus?: "open" | "offered" | "any"`).

- [ ] **Step 5: Run all referee route + service tests**

Run: `pnpm --filter @dragons/api test -- referee`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/referee/games.routes.ts apps/api/src/routes/referee/games.routes.test.ts apps/api/src/services/referee/referee-game-visibility.service.ts
git commit -m "feat(api): validate /referee/games query with Zod and pipe slotStatus through"
```

---

### Task 4: Add `getRefereeById` service

**Files:**
- Modify: `apps/api/src/services/admin/referee-admin.service.ts`
- Test: `apps/api/src/services/admin/referee-admin.service.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `referee-admin.service.test.ts`:

```ts
describe("getRefereeById", () => {
  it("returns a single RefereeListItem when present", async () => {
    const ref = await getRefereeById(1);
    expect(ref).toMatchObject({ id: 1 });
    expect(ref).not.toHaveProperty("roles");
  });

  it("returns null when no row matches", async () => {
    const ref = await getRefereeById(999_999);
    expect(ref).toBeNull();
  });
});
```

Reuse the same drizzle chain mocking pattern present in the file.

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @dragons/api test -- referee-admin.service`
Expected: FAIL — `getRefereeById is not exported`.

- [ ] **Step 3: Implement `getRefereeById`**

Append to `apps/api/src/services/admin/referee-admin.service.ts` (after `getReferees`):

```ts
export async function getRefereeById(refereeId: number): Promise<RefereeListItem | null> {
  const matchCountExpr = sql<number>`count(distinct ${matchReferees.matchId})::int`.as("match_count");

  const [row] = await db
    .select({
      id: referees.id,
      apiId: referees.apiId,
      firstName: referees.firstName,
      lastName: referees.lastName,
      licenseNumber: referees.licenseNumber,
      allowAllHomeGames: referees.allowAllHomeGames,
      allowAwayGames: referees.allowAwayGames,
      isOwnClub: referees.isOwnClub,
      matchCount: matchCountExpr,
      createdAt: referees.createdAt,
      updatedAt: referees.updatedAt,
    })
    .from(referees)
    .leftJoin(matchReferees, eq(matchReferees.refereeId, referees.id))
    .where(eq(referees.id, refereeId))
    .groupBy(referees.id);

  if (!row) return null;
  return {
    id: row.id,
    apiId: row.apiId,
    firstName: row.firstName,
    lastName: row.lastName,
    licenseNumber: row.licenseNumber,
    allowAllHomeGames: row.allowAllHomeGames,
    allowAwayGames: row.allowAwayGames,
    isOwnClub: row.isOwnClub,
    matchCount: row.matchCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 4: Drop dead `export` keyword on `RefereeScope` / `RefereeSort`**

Same file. Lines that currently read:

```ts
export type RefereeScope = "own" | "all";
export type RefereeSort = "name" | "workloadAsc" | "workloadDesc";
```

become:

```ts
type RefereeScope = "own" | "all";
type RefereeSort = "name" | "workloadAsc" | "workloadDesc";
```

(They are still used inside `RefereeListParams` below — no other change needed.)

- [ ] **Step 5: Run tests, expect pass**

Run: `pnpm --filter @dragons/api test -- referee-admin.service && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/admin/referee-admin.service.ts apps/api/src/services/admin/referee-admin.service.test.ts
git commit -m "feat(api): add getRefereeById; drop unused exports on scope/sort types"
```

---

### Task 5: Route `GET /admin/referees/:id`

**Files:**
- Modify: `apps/api/src/routes/admin/referee.routes.ts`
- Modify: `apps/api/src/routes/admin/referee.routes.test.ts` (find the existing route tests and extend; create the test file if it doesn't exist already)

- [ ] **Step 1: Write failing route tests**

In the admin referee route tests:

```ts
describe("GET /referees/:id", () => {
  it("returns 200 with referee on hit", async () => {
    const res = await app.request("/referees/1", { method: "GET" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: 1 });
  });

  it("returns 404 when not found", async () => {
    const res = await app.request("/referees/9999999", { method: "GET" });
    expect(res.status).toBe(404);
  });

  it("returns 400 on non-numeric id", async () => {
    const res = await app.request("/referees/abc", { method: "GET" });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @dragons/api test -- referee.routes`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Add the route**

In `apps/api/src/routes/admin/referee.routes.ts`, import `getRefereeById` alongside the existing imports from `referee-admin.service`. Add this handler **before** the `/referees/:id/visibility` PATCH (Hono matches in declaration order):

```ts
refereeRoutes.get(
  "/referees/:id",
  requirePermission("referee", "view"),
  describeRoute({
    description: "Get a single referee by id",
    tags: ["Referees"],
    responses: {
      200: { description: "Found" },
      400: { description: "Invalid id" },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ error: "Invalid referee ID", code: "VALIDATION_ERROR" }, 400);
    }
    const ref = await getRefereeById(id);
    if (!ref) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return c.json(ref);
  },
);
```

Make sure the `id` regex isn't shadowed by another route — `:id/visibility` and `:id/rules` are more specific paths, but Hono picks routes by declaration order, so put `:id` after them or use `where`. **Put the new GET handler at the bottom of the file, after the PATCH routes.**

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm --filter @dragons/api test -- referee.routes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/referee.routes.ts apps/api/src/routes/admin/referee.routes.test.ts
git commit -m "feat(api): add GET /admin/referees/:id for single-referee fetch"
```

---

### Task 6: Add `sr1RefereeApiId` / `sr2RefereeApiId` to `HistoryGameItem`

**Files:**
- Modify: `packages/shared/src/referee-history.ts`
- Modify: `apps/api/src/services/admin/referee-history.service.ts`
- Modify: `apps/api/src/services/admin/referee-history.service.test.ts`

- [ ] **Step 1: Write failing test**

Add inside `referee-history.service.test.ts`'s `describe("getRefereeHistoryGames", ...)`:

```ts
it("returns sr1RefereeApiId and sr2RefereeApiId on each item", async () => {
  const result = await getRefereeHistoryGames({ limit: 10, offset: 0, refereeApiId: 100 });
  for (const item of result.items) {
    expect(item).toHaveProperty("sr1RefereeApiId");
    expect(item).toHaveProperty("sr2RefereeApiId");
  }
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @dragons/api test -- referee-history.service`
Expected: FAIL — properties missing.

- [ ] **Step 3: Update shared type**

In `packages/shared/src/referee-history.ts` extend `HistoryGameItem`:

```ts
export interface HistoryGameItem {
  id: number;
  matchId: number | null;
  matchNo: number;
  kickoffDate: string;
  kickoffTime: string;
  homeTeamName: string;
  guestTeamName: string;
  leagueName: string | null;
  leagueShort: string | null;
  venueName: string | null;
  venueCity: string | null;
  sr1OurClub: boolean;
  sr2OurClub: boolean;
  sr1Name: string | null;
  sr2Name: string | null;
  sr1Status: string;
  sr2Status: string;
  sr1RefereeApiId: number | null;
  sr2RefereeApiId: number | null;
  isCancelled: boolean;
  isForfeited: boolean;
  isHomeGame: boolean;
}
```

- [ ] **Step 4: Update SELECT**

In `apps/api/src/services/admin/referee-history.service.ts`, inside `getRefereeHistoryGames`'s `columns` object, add (alongside `sr1Status`/`sr2Status`):

```ts
sr1RefereeApiId: refereeGames.sr1RefereeApiId,
sr2RefereeApiId: refereeGames.sr2RefereeApiId,
```

No other code in the file needs to change — `items as HistoryGameItem[]` already widens via the now-extended type.

- [ ] **Step 5: Run, expect pass**

Run: `pnpm --filter @dragons/api test -- referee-history.service && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/referee-history.ts apps/api/src/services/admin/referee-history.service.ts apps/api/src/services/admin/referee-history.service.test.ts
git commit -m "feat(shared,api): expose sr*RefereeApiId on history game items for role lookup"
```

---

### Task 7: Parallelize `getEligibleOpenGames`

**Files:**
- Modify: `apps/api/src/services/referee/eligible-open-games.service.ts`
- Modify: `apps/api/src/services/referee/eligible-open-games.service.test.ts`

- [ ] **Step 1: Write failing test asserting parallelism**

Append to `eligible-open-games.service.test.ts`:

```ts
it("processes candidates with bounded concurrency, preserving game order", async () => {
  const order: number[] = [];
  vi.mocked(searchCandidates).mockImplementation(async (apiMatchId) => {
    order.push(apiMatchId);
    await new Promise((r) => setTimeout(r, 10));
    return { results: [{ srId: 42, /* … minimal meta … */ }], total: 1 } as never;
  });

  // 12 open games seeded in the mocked getRefereeGames
  const start = Date.now();
  const result = await getEligibleOpenGames(42);
  const elapsed = Date.now() - start;

  // Sequential would be >120ms; concurrency 5 should finish well under 60ms
  expect(elapsed).toBeLessThan(80);

  // Output order matches input order (sort stability)
  const ids = result.items.map((g) => g.apiMatchId);
  expect(ids).toEqual([...ids].sort((a, b) => a - b /* or whatever the input ordering was */));
});
```

Adapt to the existing mock seed pattern in the file. The point of the test is: timing bound + order preservation.

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @dragons/api test -- eligible-open-games.service`
Expected: FAIL — sequential loop fails the timing bound.

- [ ] **Step 3: Implement bounded parallelism**

Rewrite the function body in `apps/api/src/services/referee/eligible-open-games.service.ts`:

```ts
import pLimit from "p-limit";
import { getRefereeGames } from "./referee-games.service";
import { searchCandidates } from "./referee-assignment.service";
import { isRefereeEligibleForGame } from "./referee-slot-resolver";
import type { EligibleOpenGamesResponse, RefereeGameListItem } from "@dragons/shared";

const CONCURRENCY = 5;

export async function getEligibleOpenGames(
  refereeApiId: number,
): Promise<EligibleOpenGamesResponse> {
  const openGames = await getRefereeGames({
    limit: 500,
    offset: 0,
    status: "active",
  });

  const gamesWithOpenSlot = openGames.items.filter(
    (g) =>
      (g.sr1Status === "open" && g.sr1RefereeApiId == null) ||
      (g.sr2Status === "open" && g.sr2RefereeApiId == null),
  );

  const limit = pLimit(CONCURRENCY);
  const evaluated = await Promise.all(
    gamesWithOpenSlot.map((game) =>
      limit(async (): Promise<RefereeGameListItem | null> => {
        const openSlot: 1 | 2 =
          game.sr1Status === "open" && game.sr1RefereeApiId == null ? 1 : 2;
        const candidateList = await searchCandidates(game.apiMatchId, "", 0, 100, openSlot);
        const meta = candidateList.results.find((c) => c.srId === refereeApiId);
        if (meta && isRefereeEligibleForGame(meta, openSlot)) return game;
        return null;
      }),
    ),
  );

  return { items: evaluated.filter((g): g is RefereeGameListItem => g !== null) };
}
```

`p-limit` is already a dep of `@dragons/api` (see `apps/api/package.json`). No install needed.

- [ ] **Step 4: Run, expect pass**

Run: `pnpm --filter @dragons/api test -- eligible-open-games.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/referee/eligible-open-games.service.ts apps/api/src/services/referee/eligible-open-games.service.test.ts
git commit -m "perf(api): parallelize eligible-open-games with bounded concurrency"
```

---

## Web layer

### Task 8: Promote `search` and `sort` to URL state; drop dead exports

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/use-referee-hub-url.ts`
- Modify: `apps/web/src/components/admin/referee-hub/use-referee-hub-url.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `use-referee-hub-url.test.ts`:

```ts
it("parses search and sort from query, with defaults", () => {
  expect(parseHubUrl(new URLSearchParams("")).search).toBe("");
  expect(parseHubUrl(new URLSearchParams("")).sort).toBe("name");
  expect(parseHubUrl(new URLSearchParams("search=mei&sort=workloadDesc")).search).toBe("mei");
  expect(parseHubUrl(new URLSearchParams("search=mei&sort=workloadDesc")).sort).toBe("workloadDesc");
});

it("ignores invalid sort and falls back to name", () => {
  expect(parseHubUrl(new URLSearchParams("sort=bogus")).sort).toBe("name");
});

it("serializes only non-default search/sort under referees tab", () => {
  const qs = buildHubUrl({
    tab: "referees",
    gameId: null,
    refereeId: null,
    subtab: "profile",
    filters: DEFAULT_FILTERS_FIXTURE, // import from test helpers if present, otherwise inline
    scope: "own",
    search: "mei",
    sort: "workloadDesc",
  } as never);
  expect(qs).toContain("search=mei");
  expect(qs).toContain("sort=workloadDesc");
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @dragons/web test -- use-referee-hub-url`
Expected: FAIL.

- [ ] **Step 3: Extend the URL state**

In `apps/web/src/components/admin/referee-hub/use-referee-hub-url.ts`:

```ts
export type HubTab = "open-slots" | "referees";
export type HubSubtab = "profile" | "upcoming" | "history" | "rules";
type HubStatus = "open" | "offered" | "any";
type HubGameType = "home" | "away" | "both";
type HubScope = "own" | "all";
export type HubSort = "name" | "workloadAsc" | "workloadDesc";

export interface HubFilters {
  status: HubStatus;
  league: string[];
  dateFrom: string | null;
  dateTo: string | null;
  gameType: HubGameType;
}

export interface HubState {
  tab: HubTab;
  gameId: number | null;
  refereeId: number | null;
  subtab: HubSubtab;
  filters: HubFilters;
  scope: HubScope;
  search: string;
  sort: HubSort;
}

const SORTS: readonly HubSort[] = ["name", "workloadAsc", "workloadDesc"];

const DEFAULT_STATE: HubState = {
  tab: "open-slots",
  gameId: null,
  refereeId: null,
  subtab: "profile",
  filters: DEFAULT_FILTERS,
  scope: "own",
  search: "",
  sort: "name",
};
```

Update `parseHubUrl` to read `search` (default `""`) and `sort` (clamped against `SORTS`). Update `buildHubUrl` to set both under `state.tab === "referees"` when they differ from defaults.

(Drop the `export` keyword on `HubStatus`, `HubGameType`, `HubScope` per spec.)

- [ ] **Step 4: Run, expect pass**

Run: `pnpm --filter @dragons/web test -- use-referee-hub-url && pnpm typecheck`
Expected: PASS — typecheck may catch consumers needing the new fields (they default-merge inside `update()`, so most callers are fine).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/use-referee-hub-url.ts apps/web/src/components/admin/referee-hub/use-referee-hub-url.test.ts
git commit -m "feat(web): promote referee-hub search and sort into URL state"
```

---

### Task 9: Add SWR key for single referee

**Files:**
- Modify: `apps/web/src/lib/swr-keys.ts`

- [ ] **Step 1: Add the key**

In `apps/web/src/lib/swr-keys.ts`, in the `SWR_KEYS` object after `refereeCounts`:

```ts
referee: (id: number) => `/admin/referees/${id}`,
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/swr-keys.ts
git commit -m "feat(web): add referee(id) SWR key for single-referee fetch"
```

---

### Task 10: TZ-aware SSR date defaults

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/referees/page.tsx`

- [ ] **Step 1: Replace UTC slice with Europe/Berlin formatting**

In `apps/web/src/app/[locale]/admin/referees/page.tsx`, replace the `today` / `to` block:

```ts
function todayInTz(tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // "YYYY-MM-DD"
}

function plusDaysInTz(tz: string, days: number): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(Date.now() + days * 86400_000));
}

const TZ = "Europe/Berlin";
const today = todayInTz(TZ);
const to = plusDaysInTz(TZ, 14);
```

The client uses the same defaults (no `dateFrom`/`dateTo` in URL = no date filter sent to server). Document the intent in a one-line comment so a reader understands `Europe/Berlin` is the canonical timezone for this admin tool — but **do not** add a paragraph; one line max.

- [ ] **Step 2: Typecheck + targeted run**

Run: `pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/admin/referees/page.tsx
git commit -m "fix(web): build SSR referee-hub date defaults in Europe/Berlin TZ"
```

---

### Task 11: Server-driven `referee-list.tsx` with scope chip and counts

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/referees/referee-list.tsx`
- Modify: `apps/web/src/components/admin/referee-hub/referees/referee-list.test.tsx`

- [ ] **Step 1: Write failing tests**

Extend `referee-list.test.tsx`:

```ts
it("renders Own (N) | All (M) chip group from /counts", async () => {
  vi.mocked(useSWR).mockImplementation((key: string) => {
    if (key === "/admin/referees/counts") return { data: { own: 7, all: 23 } } as never;
    return { data: { items: [], total: 0, limit: 50, offset: 0, hasMore: false } } as never;
  });
  render(wrap(<RefereeList selectedId={null} onSelect={() => {}} />));
  expect(screen.getByRole("button", { name: /own \(7\)/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /all \(23\)/i })).toBeInTheDocument();
});

it("clicking All chip flips state.scope", async () => {
  const update = vi.fn();
  vi.mocked(useRefereeHubUrl).mockReturnValue({ state: { /* ... */ scope: "own" } as never, update });
  render(wrap(<RefereeList selectedId={null} onSelect={() => {}} />));
  fireEvent.click(screen.getByRole("button", { name: /all/i }));
  expect(update).toHaveBeenCalledWith({ scope: "all" });
});

it("debounces search input by 300ms", async () => {
  const update = vi.fn();
  vi.mocked(useRefereeHubUrl).mockReturnValue({ state: { /* ... */ search: "" } as never, update });
  render(wrap(<RefereeList selectedId={null} onSelect={() => {}} />));
  fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "mei" } });
  await vi.advanceTimersByTimeAsync(300);
  expect(update).toHaveBeenCalledWith({ search: "mei" });
});

it("renders 2 KPI cards (own-club refs, avg matches) sourced from counts/data", () => {
  // assert exactly two KPI cards, not three
});
```

Use the existing mock pattern in `referee-list.test.tsx`. Wrap in fake timers for the debounce test (`vi.useFakeTimers()` in `beforeEach`).

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @dragons/web test -- referee-list`
Expected: FAIL.

- [ ] **Step 3: Rewrite the component**

Replace `apps/web/src/components/admin/referee-hub/referees/referee-list.tsx` with a server-driven implementation. Key behaviors:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI, APIError } from "@/lib/api";
import { useRefereeHubUrl } from "../use-referee-hub-url";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@dragons/ui/components/input";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@dragons/ui/components/select";
import { Button } from "@dragons/ui/components/button";
import { cn } from "@dragons/ui/lib/utils";
import type { RefereeListItem, PaginatedResponse, RefereeCountsResponse } from "@dragons/shared";

interface Props {
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function RefereeList({ selectedId, onSelect }: Props) {
  const t = useTranslations("refereeHub.referees");
  const { state, update } = useRefereeHubUrl();
  const [searchLocal, setSearchLocal] = useState(state.search);
  const debouncedSearch = useDebounce(searchLocal, 300);

  useEffect(() => {
    if (debouncedSearch !== state.search) update({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const listKey = SWR_KEYS.refereesPaginated({
    scope: state.scope,
    search: state.search || undefined,
    sort: state.sort,
    limit: 50,
    offset: 0,
  });

  const { data } = useSWR<PaginatedResponse<RefereeListItem>>(listKey, apiFetcher);
  const { data: counts } = useSWR<RefereeCountsResponse>(SWR_KEYS.refereeCounts, apiFetcher, { dedupingInterval: 30_000 });
  const items = data?.items ?? [];

  const avg = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.round(items.reduce((s, r) => s + r.matchCount, 0) / items.length);
  }, [items]);

  async function toggleOwnClub(ref: RefereeListItem, checked: boolean) {
    try {
      await fetchAPI(`/admin/referees/${ref.id}/visibility`, {
        method: "PATCH",
        body: JSON.stringify({ isOwnClub: checked, allowAllHomeGames: ref.allowAllHomeGames, allowAwayGames: ref.allowAwayGames }),
      });
      await Promise.all([mutate(listKey), mutate(SWR_KEYS.refereeCounts)]);
    } catch (err) {
      toast.error(err instanceof APIError ? err.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex gap-2">
        <Button
          variant={state.scope === "own" ? "default" : "outline"}
          size="sm"
          onClick={() => update({ scope: "own" })}
        >
          {t("scope.own", { n: String(counts?.own ?? "") })}
        </Button>
        <Button
          variant={state.scope === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => update({ scope: "all" })}
        >
          {t("scope.all", { n: String(counts?.all ?? "") })}
        </Button>
      </div>

      <div className="p-3 border-b grid grid-cols-2 gap-2">
        <Kpi label={t("kpi.ownClubRefs")} value={counts?.own ?? 0} />
        <Kpi label={t("kpi.avgMatches")} value={avg} />
      </div>

      <div className="p-3 border-b flex gap-2">
        <Input
          value={searchLocal}
          onChange={(e) => setSearchLocal(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
        />
        <Select value={state.sort} onValueChange={(v) => update({ sort: v as never })}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">{t("sort.name")}</SelectItem>
            <SelectItem value="workloadDesc">{t("sort.workloadDesc")}</SelectItem>
            <SelectItem value="workloadAsc">{t("sort.workloadAsc")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto">
        {items.length === 0 && <div className="p-4 text-sm text-muted-foreground">{t("empty")}</div>}
        {items.map((r) => (
          <div
            key={r.id}
            className={cn(
              "grid grid-cols-[1fr_36px_44px] items-center gap-2 px-3 py-2 border-b cursor-pointer hover:bg-muted/40",
              selectedId === r.id && "bg-primary text-primary-foreground hover:bg-primary",
            )}
            onClick={() => onSelect(r.id)}
            data-selected={selectedId === r.id}
          >
            <div>
              <div className="text-sm font-medium">{r.lastName}, {r.firstName}</div>
              <div className="text-xs opacity-70">Lic {r.licenseNumber ?? "—"}</div>
            </div>
            <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                aria-label={t("columns.own")}
                checked={r.isOwnClub}
                onCheckedChange={(checked) => toggleOwnClub(r, checked === true)}
              />
            </div>
            <div className="text-sm text-center tabular-nums">{r.matchCount}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
```

Add the new i18n keys to `apps/web/src/messages/en.json` (and `de.json`) under `refereeHub.referees`:

```json
"scope": { "own": "Own ({n})", "all": "All ({n})" },
"kpi": { "ownClubRefs": "Own-club refs", "avgMatches": "Avg matches/ref" }
```

(Replace existing `kpi.total` / `kpi.refs` / `kpi.workload` entries if they're no longer referenced. Run a grep to confirm.)

- [ ] **Step 4: Run, expect pass**

Run: `pnpm --filter @dragons/web test -- referee-list && pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/referees/referee-list.tsx apps/web/src/components/admin/referee-hub/referees/referee-list.test.tsx apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): drive referee-list from server with scope chip and counts"
```

---

### Task 12: Fetch-by-id `referee-detail.tsx`

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/referees/referee-detail.tsx`
- Create: `apps/web/src/components/admin/referee-hub/referees/referee-detail.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `referee-detail.test.tsx`:

```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RefereeDetail } from "./referee-detail";

vi.mock("swr", () => ({
  default: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock("../use-referee-hub-url", () => ({
  useRefereeHubUrl: () => ({ state: { subtab: "profile" }, update: vi.fn() }),
}));

const messages = { refereeHub: { referees: {
  notFound: "Referee not found",
  ownClubBadge: "Own club",
  subtabs: { profile: "Profile", rules: "Rules", upcoming: "Upcoming", history: "History" },
} } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe("RefereeDetail", () => {
  it("fetches by id via /admin/referees/:id", async () => {
    const useSWR = (await import("swr")).default;
    vi.mocked(useSWR).mockReturnValue({ data: { id: 1, firstName: "Anna", lastName: "Müller", apiId: 100, licenseNumber: 12345, isOwnClub: true, matchCount: 14 } } as never);
    render(wrap(<RefereeDetail refereeId={1} />));
    expect(useSWR).toHaveBeenCalledWith("/admin/referees/1", expect.any(Function));
    expect(screen.getByText(/Müller, Anna/)).toBeInTheDocument();
  });

  it("renders notFound message when SWR returns null", async () => {
    const useSWR = (await import("swr")).default;
    vi.mocked(useSWR).mockReturnValue({ data: null } as never);
    render(wrap(<RefereeDetail refereeId={999} />));
    expect(screen.getByText(/Referee not found/)).toBeInTheDocument();
  });

  it("disables the Rules tab when isOwnClub is false", async () => {
    const useSWR = (await import("swr")).default;
    vi.mocked(useSWR).mockReturnValue({ data: { id: 1, firstName: "A", lastName: "B", apiId: 1, licenseNumber: 0, isOwnClub: false, matchCount: 0 } } as never);
    render(wrap(<RefereeDetail refereeId={1} />));
    expect(screen.getByRole("tab", { name: /rules/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @dragons/web test -- referee-detail`
Expected: FAIL.

- [ ] **Step 3: Rewrite the component**

Replace `apps/web/src/components/admin/referee-hub/referees/referee-detail.tsx`:

```tsx
"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { useRefereeHubUrl, type HubSubtab } from "../use-referee-hub-url";
import { ProfileSubtab } from "./profile-subtab";
import { RulesSubtab } from "./rules-subtab";
import { UpcomingSubtab } from "./upcoming-subtab";
import { HistorySubtab } from "./history-subtab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@dragons/ui/components/tabs";
import { Badge } from "@dragons/ui/components/badge";
import type { RefereeListItem } from "@dragons/shared";

interface Props { refereeId: number }

export function RefereeDetail({ refereeId }: Props) {
  const t = useTranslations("refereeHub.referees");
  const { state, update } = useRefereeHubUrl();

  const { data: ref } = useSWR<RefereeListItem | null>(SWR_KEYS.referee(refereeId), apiFetcher);

  if (!ref) return <div className="p-6 text-sm text-muted-foreground">{t("notFound")}</div>;

  return (
    <div>
      <div className="p-4 border-b flex justify-between items-start">
        <div>
          <h2 className="text-xl font-semibold">{ref.lastName}, {ref.firstName}</h2>
          <div className="text-xs text-muted-foreground">Lic {ref.licenseNumber ?? "—"} · API {ref.apiId}</div>
        </div>
        {ref.isOwnClub && <Badge variant="secondary">{t("ownClubBadge")}</Badge>}
      </div>
      <Tabs value={state.subtab} onValueChange={(v) => update({ subtab: v as HubSubtab })}>
        <TabsList className="m-4">
          <TabsTrigger value="profile">{t("subtabs.profile")}</TabsTrigger>
          <TabsTrigger value="rules" disabled={!ref.isOwnClub} title={!ref.isOwnClub ? t("rules.disabledHint") : undefined}>
            {t("subtabs.rules")}
          </TabsTrigger>
          <TabsTrigger value="upcoming">{t("subtabs.upcoming")}</TabsTrigger>
          <TabsTrigger value="history">{t("subtabs.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileSubtab referee={ref} /></TabsContent>
        <TabsContent value="rules"><RulesSubtab referee={ref} /></TabsContent>
        <TabsContent value="upcoming"><UpcomingSubtab referee={ref} /></TabsContent>
        <TabsContent value="history"><HistorySubtab referee={ref} /></TabsContent>
      </Tabs>
    </div>
  );
}
```

Add `refereeHub.referees.rules.disabledHint` to en/de messages: e.g. `"Mark as own-club referee first"`.

(`RulesSubtab` is created in Task 13. The import will not yet resolve — that's expected; it resolves at the next commit.)

- [ ] **Step 4: Defer running until Task 13 lands**

Skip the test+pass cycle here; the component will compile only after `rules-subtab.tsx` exists. Continue to Task 13 in the same iteration.

> **Note for the implementer/reviewer:** Tasks 12, 13, and 14 form one TDD slice. Commit after all three pass. If you must commit Task 12 separately, comment out the `<RulesSubtab/>` import and tab body temporarily — but the cleaner path is to land all three together.

---

### Task 13: New `rules-subtab.tsx` with explicit save bar

**Files:**
- Create: `apps/web/src/components/admin/referee-hub/referees/rules-subtab.tsx`
- Create: `apps/web/src/components/admin/referee-hub/referees/rules-subtab.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `rules-subtab.test.tsx`:

```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RulesSubtab } from "./rules-subtab";

const ref = { id: 1, apiId: 100, firstName: "A", lastName: "B", licenseNumber: 1, matchCount: 0, allowAllHomeGames: true, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" };

vi.mock("swr", () => ({
  default: vi.fn((key: string) => {
    if (key === "/admin/teams") return { data: [{ id: 10, name: "Dragons H1", customName: null, leagueName: "OL" }] };
    if (key === `/admin/referees/${ref.id}/rules`) return { data: { rules: [] } };
    return { data: undefined };
  }),
  mutate: vi.fn(),
}));

const fetchAPI = vi.fn().mockResolvedValue({ rules: [] });
vi.mock("@/lib/api", () => ({ fetchAPI: (...a: unknown[]) => fetchAPI(...a), APIError: class extends Error {} }));

const messages = { refereeHub: { referees: { rules: {
  title: "Rules", add: "Add", deny: "Deny", allow: "Allow", selectTeam: "Team", none: "No rules",
  save: { save: "Save", discard: "Discard", saving: "Saving", saved: "Saved {n}s ago", dirty: "Unsaved", error: "Failed: {msg}" },
} } } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

beforeEach(() => { fetchAPI.mockClear(); });
afterEach(() => { cleanup(); });

describe("RulesSubtab", () => {
  it("Save button is disabled when clean", () => {
    render(wrap(<RulesSubtab referee={ref} />));
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("Save is enabled after adding a rule and POSTs to /rules", async () => {
    render(wrap(<RulesSubtab referee={ref} />));
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(fetchAPI).toHaveBeenCalledWith(
        "/admin/referees/1/rules",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("Discard resets to fetched rules and clears dirty", () => {
    render(wrap(<RulesSubtab referee={ref} />));
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("surfaces save error inline without toast", async () => {
    fetchAPI.mockRejectedValueOnce(new Error("boom"));
    render(wrap(<RulesSubtab referee={ref} />));
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(screen.getByText(/Failed: boom/)).toBeInTheDocument());
    // dirty preserved
    expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @dragons/web test -- rules-subtab`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement `rules-subtab.tsx`**

Create the file with this content:

```tsx
"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate as swrMutate } from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI, APIError } from "@/lib/api";
import { Button } from "@dragons/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@dragons/ui/components/select";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Trash2, Plus } from "lucide-react";
import type { RefereeListItem } from "@dragons/shared";

interface Team { id: number; name: string; customName: string | null; leagueName: string | null }
interface Rule { teamId: number; deny: boolean; allowSr1: boolean; allowSr2: boolean }
interface RulesResp { rules: Rule[] }

interface Props { referee: RefereeListItem }

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function RulesSubtab({ referee }: Props) {
  const t = useTranslations("refereeHub.referees.rules");
  const tSave = useTranslations("refereeHub.referees.rules.save");

  const { data: teamsData = [] } = useSWR<Team[]>(SWR_KEYS.teams, apiFetcher);
  const { data: rulesData } = useSWR<RulesResp>(SWR_KEYS.refereeRules(referee.id), apiFetcher);

  const [rules, setRules] = useState<Rule[]>([]);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (rulesData?.rules) {
      setRules(rulesData.rules);
      setStatus("idle");
      setErrorMsg(null);
    }
  }, [rulesData, referee.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function markDirty() {
    setStatus("dirty");
    setErrorMsg(null);
  }

  function addRule() {
    setRules((r) => [...r, { teamId: teamsData[0]?.id ?? 0, deny: false, allowSr1: false, allowSr2: true }]);
    markDirty();
  }

  function updateRule(i: number, p: Partial<Rule>) {
    setRules((r) => r.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
    markDirty();
  }

  function removeRule(i: number) {
    setRules((r) => r.filter((_, idx) => idx !== i));
    markDirty();
  }

  function discard() {
    setRules(rulesData?.rules ?? []);
    setStatus("idle");
    setErrorMsg(null);
  }

  async function save() {
    setStatus("saving");
    try {
      await fetchAPI(`/admin/referees/${referee.id}/rules`, {
        method: "PATCH",
        body: JSON.stringify({ rules: rules.filter((r) => r.deny || r.allowSr1 || r.allowSr2) }),
      });
      await swrMutate(SWR_KEYS.refereeRules(referee.id));
      await swrMutate(SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 }));
      setStatus("saved");
      setLastSavedAt(Date.now());
    } catch (err) {
      const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : "Save failed";
      setErrorMsg(msg);
      setStatus("error");
    }
  }

  const isDirty = status === "dirty" || status === "error";
  const saveDisabled = !isDirty || status === "saving";

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("title")}</div>
        <Button size="sm" variant="outline" onClick={addRule}>
          <Plus className="h-3 w-3 mr-1" /> {t("add")}
        </Button>
      </div>

      {rules.length === 0 && (
        <div className="text-sm text-muted-foreground py-2">{t("none")}</div>
      )}

      <div className="space-y-2">
        {rules.map((rule, i) => (
          <div key={i} className="flex items-center gap-2 border rounded-md p-2">
            <Select value={String(rule.teamId)} onValueChange={(v) => updateRule(i, { teamId: Number(v) })}>
              <SelectTrigger className="flex-1 min-w-0"><SelectValue placeholder={t("selectTeam")} /></SelectTrigger>
              <SelectContent>
                {teamsData.map((tm) => (
                  <SelectItem key={tm.id} value={String(tm.id)}>
                    {tm.customName ?? tm.name}{tm.leagueName && ` (${tm.leagueName})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant={rule.deny ? "destructive" : "secondary"}
              onClick={() => updateRule(i, { deny: !rule.deny, allowSr1: !rule.deny ? false : rule.allowSr1, allowSr2: !rule.deny ? false : rule.allowSr2 })}
            >
              {rule.deny ? t("deny") : t("allow")}
            </Button>
            {!rule.deny && (
              <>
                <label className="flex items-center gap-1 text-xs">
                  <Checkbox checked={rule.allowSr1} onCheckedChange={(v) => updateRule(i, { allowSr1: v === true })} /> SR1
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <Checkbox checked={rule.allowSr2} onCheckedChange={(v) => updateRule(i, { allowSr2: v === true })} /> SR2
                </label>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={() => removeRule(i)} aria-label="remove">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-background border-t flex items-center justify-between text-xs">
        <span className={status === "error" ? "text-destructive" : "text-muted-foreground"}>
          {status === "saving" ? tSave("saving") :
           status === "dirty"  ? tSave("dirty") :
           status === "saved"  ? tSave("saved", { n: String(Math.max(1, Math.floor(((Date.now() - (lastSavedAt ?? Date.now())) / 1000)))) }) :
           status === "error"  ? tSave("error", { msg: errorMsg ?? "" }) :
           ""}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!isDirty} onClick={discard}>{tSave("discard")}</Button>
          <Button size="sm" disabled={saveDisabled} onClick={() => void save()}>{tSave("save")}</Button>
        </div>
      </div>
    </div>
  );
}
```

Add to `apps/web/src/messages/en.json` (and `de.json`) under `refereeHub.referees.rules`:

```json
"title": "Per-team rules",
"add": "Add rule",
"deny": "Deny",
"allow": "Allow",
"selectTeam": "Team",
"none": "No rules",
"disabledHint": "Mark as own-club referee first",
"save": {
  "save": "Save",
  "discard": "Discard",
  "saving": "Saving…",
  "saved": "Saved {n}s ago",
  "dirty": "Unsaved",
  "error": "Save failed: {msg}"
}
```

(Some of these keys may already exist from the parent ProfileSubtab — reuse rather than duplicate. Confirm with a grep.)

- [ ] **Step 4: Run, expect pass**

Run: `pnpm --filter @dragons/web test -- rules-subtab`
Expected: PASS.

- [ ] **Step 5: Commit (with Task 12 and Task 14)**

See Task 14 — these commit together as one slice.

---

### Task 14: Strip Rules from `ProfileSubtab`

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/referees/profile-subtab.tsx`
- Modify: `apps/web/src/components/admin/referee-hub/referees/profile-subtab.test.tsx`

- [ ] **Step 1: Adjust the existing skipped test block**

In `profile-subtab.test.tsx`, the existing `describe.skip` block already documents that tests are skipped pending the React 19 + Radix Switch upstream fix. Remove the Rules-related assertions (the `/rules` PATCH assertion and the rules-related body assertion) from the first test, leaving only the visibility PATCH assertions. Update the mock messages so the rules section keys are no longer needed.

- [ ] **Step 2: Trim the component**

Replace `apps/web/src/components/admin/referee-hub/referees/profile-subtab.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate as swrMutate } from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr"; // kept for the visibility autosave
import { SWR_KEYS } from "@/lib/swr-keys";
import { fetchAPI } from "@/lib/api";
import { useAutoSave } from "./use-auto-save";
import { Switch } from "@dragons/ui/components/switch";
import { Label } from "@dragons/ui/components/label";
import { Button } from "@dragons/ui/components/button";
import type { RefereeListItem } from "@dragons/shared";

interface Props { referee: RefereeListItem }

export function ProfileSubtab({ referee }: Props) {
  const t = useTranslations("refereeHub.referees.profile");
  const [visibility, setVisibility] = useState({
    isOwnClub: referee.isOwnClub,
    allowAllHomeGames: referee.allowAllHomeGames,
    allowAwayGames: referee.allowAwayGames,
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setVisibility({
      isOwnClub: referee.isOwnClub,
      allowAllHomeGames: referee.allowAllHomeGames,
      allowAwayGames: referee.allowAwayGames,
    });
  }, [referee.id, referee.isOwnClub, referee.allowAllHomeGames, referee.allowAwayGames]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { status, lastSavedAt, markDirty, saveNow } = useAutoSave({
    save: async () => {
      await fetchAPI(`/admin/referees/${referee.id}/visibility`, {
        method: "PATCH",
        body: JSON.stringify(visibility),
      });
      await Promise.all([
        swrMutate(SWR_KEYS.referee(referee.id)),
        swrMutate(SWR_KEYS.refereesPaginated({ scope: "own", limit: 50 })),
        swrMutate(SWR_KEYS.refereeCounts),
      ]);
    },
  });

  function patchVisibility(p: Partial<typeof visibility>) {
    setVisibility((v) => ({ ...v, ...p }));
    markDirty();
  }

  return (
    <div className="space-y-6 p-4">
      <section>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">{t("visibility.title")}</div>
        <Row label={t("visibility.ownClub")}>
          <Switch checked={visibility.isOwnClub} onCheckedChange={(v) => patchVisibility({ isOwnClub: v })} aria-label={t("visibility.ownClub")} />
        </Row>
        <Row label={t("visibility.allHome")}>
          <Switch checked={visibility.allowAllHomeGames} onCheckedChange={(v) => patchVisibility({ allowAllHomeGames: v })} aria-label={t("visibility.allHome")} />
        </Row>
        <Row label={t("visibility.away")}>
          <Switch checked={visibility.allowAwayGames} onCheckedChange={(v) => patchVisibility({ allowAwayGames: v })} aria-label={t("visibility.away")} />
        </Row>
      </section>

      <SaveStatusBar status={status} lastSavedAt={lastSavedAt} onSaveNow={() => void saveNow()} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <Label className="text-sm">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

function SaveStatusBar({ status, lastSavedAt, onSaveNow }: { status: string; lastSavedAt: number | null; onSaveNow: () => void }) {
  const t = useTranslations("refereeHub.referees.profile.save");
  // eslint-disable-next-line react-hooks/purity
  const secondsAgo = lastSavedAt ? Math.max(1, Math.floor((Date.now() - lastSavedAt) / 1000)) : 0;
  const text =
    status === "saving" ? t("saving") :
    status === "dirty" ? t("dirty") :
    status === "error" ? t("error") :
    status === "saved" ? t("saved", { n: String(secondsAgo) }) :
    "";
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{text}</span>
      <Button size="sm" variant="outline" onClick={onSaveNow}>{t("now")}</Button>
    </div>
  );
}
```

Drop the now-unused i18n keys `refereeHub.referees.profile.rules.*` and `refereeHub.referees.profile.rules.add` etc. from `en.json` / `de.json` (the Rules subtab uses `refereeHub.referees.rules.*` — confirm by grep before deleting).

- [ ] **Step 3: Run, expect pass**

Run: `pnpm --filter @dragons/web test -- profile-subtab rules-subtab referee-detail && pnpm --filter @dragons/web typecheck`
Expected: PASS (profile-subtab tests remain `describe.skip`, that's fine).

- [ ] **Step 4: Commit Tasks 12–14 as a single slice**

```bash
git add apps/web/src/components/admin/referee-hub/referees/referee-detail.tsx \
        apps/web/src/components/admin/referee-hub/referees/referee-detail.test.tsx \
        apps/web/src/components/admin/referee-hub/referees/rules-subtab.tsx \
        apps/web/src/components/admin/referee-hub/referees/rules-subtab.test.tsx \
        apps/web/src/components/admin/referee-hub/referees/profile-subtab.tsx \
        apps/web/src/components/admin/referee-hub/referees/profile-subtab.test.tsx \
        apps/web/src/messages/en.json \
        apps/web/src/messages/de.json
git commit -m "feat(web): split referee profile into Profile (autosave) + Rules (explicit save) subtabs"
```

---

### Task 15: History subtab — apiId role detection + load-more

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/referees/history-subtab.tsx`
- Create: `apps/web/src/components/admin/referee-hub/referees/history-subtab.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `history-subtab.test.tsx`:

```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { HistorySubtab } from "./history-subtab";

const ref = { id: 1, apiId: 100, firstName: "A", lastName: "Müller", licenseNumber: 0, matchCount: 0, allowAllHomeGames: true, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" };

const item = (n: number, sr1ApiId: number | null, sr2ApiId: number | null) => ({
  id: n, matchId: n, matchNo: 1000 + n, kickoffDate: "2026-04-01", kickoffTime: "18:00",
  homeTeamName: "H", guestTeamName: "G", leagueName: "OL", leagueShort: "OL",
  venueName: null, venueCity: null, sr1OurClub: false, sr2OurClub: false,
  sr1Name: "Foo Müller", sr2Name: "Bar Müller",
  sr1Status: "assigned", sr2Status: "assigned",
  sr1RefereeApiId: sr1ApiId, sr2RefereeApiId: sr2ApiId,
  isCancelled: false, isForfeited: false, isHomeGame: true,
});

vi.mock("swr", () => ({
  default: vi.fn(() => ({
    data: { items: [item(1, 100, 999), item(2, 999, 100)], total: 4, limit: 2, offset: 0, hasMore: true },
  })),
  mutate: vi.fn(),
}));

const messages = { refereeHub: { referees: { history: {
  total: "{n} games",
  exportCsv: "Export",
  loadMore: "Load more",
  statusPlayed: "played", statusCancelled: "cancelled", statusForfeited: "forfeited",
  empty: "No games",
} } } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

afterEach(() => cleanup());

describe("HistorySubtab", () => {
  it("derives SR1/SR2 from apiId match, not name substring", () => {
    render(wrap(<HistorySubtab referee={ref} />));
    const rows = screen.getAllByText(/H vs G/);
    expect(rows[0].parentElement?.textContent).toMatch(/SR1/);
    expect(rows[1].parentElement?.textContent).toMatch(/SR2/);
  });

  it("renders Load more when hasMore is true", () => {
    render(wrap(<HistorySubtab referee={ref} />));
    expect(screen.getByRole("button", { name: /load more/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @dragons/web test -- history-subtab`
Expected: FAIL.

- [ ] **Step 3: Rewrite the component**

Replace `apps/web/src/components/admin/referee-hub/referees/history-subtab.tsx`:

```tsx
"use client";

import { useState } from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { Button } from "@dragons/ui/components/button";
import type { RefereeListItem, HistoryGameItem } from "@dragons/shared";

interface Props { referee: RefereeListItem }

interface HistoryResp {
  items: HistoryGameItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const PAGE = 50;

export function HistorySubtab({ referee }: Props) {
  const t = useTranslations("refereeHub.referees.history");
  const [pages, setPages] = useState(1);

  const qs = new URLSearchParams({
    refereeApiId: String(referee.apiId),
    limit: String(pages * PAGE),
    offset: "0",
  }).toString();

  const { data } = useSWR<HistoryResp>(SWR_KEYS.refereeHistoryGames(qs), apiFetcher);
  const items = data?.items ?? [];

  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{t("total", { n: String(data?.total ?? items.length) })}</div>
        <Button asChild size="sm" variant="outline">
          <a href={`/api/admin/referee/history/games.csv?${qs}`} download>{t("exportCsv")}</a>
        </Button>
      </div>

      <div className="space-y-1">
        {items.map((g) => {
          const role =
            g.sr1RefereeApiId === referee.apiId ? "SR1" :
            g.sr2RefereeApiId === referee.apiId ? "SR2" : "—";
          const status = g.isCancelled ? t("statusCancelled") : g.isForfeited ? t("statusForfeited") : t("statusPlayed");
          return (
            <div key={g.id} className="flex justify-between border rounded-md p-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">{g.kickoffDate} · {role} · {g.leagueShort ?? ""}</div>
                <div>{g.homeTeamName} vs {g.guestTeamName}</div>
              </div>
              <span className="text-xs text-muted-foreground">{status}</span>
            </div>
          );
        })}
        {items.length === 0 && <div className="text-sm text-muted-foreground">{t("empty")}</div>}
      </div>

      {data?.hasMore && (
        <Button variant="outline" size="sm" onClick={() => setPages((n) => n + 1)}>
          {t("loadMore")}
        </Button>
      )}
    </div>
  );
}
```

Add `refereeHub.referees.history.loadMore` to en/de.

- [ ] **Step 4: Run, expect pass**

Run: `pnpm --filter @dragons/web test -- history-subtab && pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/referees/history-subtab.tsx \
        apps/web/src/components/admin/referee-hub/referees/history-subtab.test.tsx \
        apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "fix(web): derive history role from apiId match; add load-more pagination"
```

---

### Task 16: Slot-card inline error chip

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/slot-card.tsx`
- Create: `apps/web/src/components/admin/referee-hub/open-slots/slot-card.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `slot-card.test.tsx`:

```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SlotCard } from "./slot-card";

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast }));

const fetchAPI = vi.fn();
vi.mock("@/lib/api", () => ({ fetchAPI: (...a: unknown[]) => fetchAPI(...a), APIError: class extends Error {} }));

vi.mock("./candidate-picker", () => ({
  CandidatePicker: ({ onPick }: { onPick: (n: number) => void }) =>
    <button onClick={() => onPick(7)} data-testid="pick">pick</button>,
}));

const messages = { refereeHub: { openSlots: {
  slot: { label: "SR{n}", open: "Open", unassign: "Unassign" },
  errorChip: { dismiss: "Dismiss" },
} } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

beforeEach(() => { fetchAPI.mockReset(); toast.success.mockReset(); toast.error.mockReset(); });
afterEach(() => cleanup());

describe("SlotCard", () => {
  it("renders inline error chip on assign failure (no toast)", async () => {
    fetchAPI.mockRejectedValueOnce(new Error("federation down"));
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={{ refereeApiId: null, refereeName: null, status: "open" }} onChange={() => {}} />));
    fireEvent.click(screen.getByTestId("pick"));
    await waitFor(() => expect(screen.getByText(/federation down/)).toBeInTheDocument());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("dismiss clears the chip", async () => {
    fetchAPI.mockRejectedValueOnce(new Error("nope"));
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={{ refereeApiId: null, refereeName: null, status: "open" }} onChange={() => {}} />));
    fireEvent.click(screen.getByTestId("pick"));
    await waitFor(() => expect(screen.getByText("nope")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("nope")).not.toBeInTheDocument();
  });

  it("does not toast on success either", async () => {
    fetchAPI.mockResolvedValueOnce({});
    const onChange = vi.fn();
    render(wrap(<SlotCard gameApiId={1} slotNumber={1} assignment={{ refereeApiId: null, refereeName: null, status: "open" }} onChange={onChange} />));
    fireEvent.click(screen.getByTestId("pick"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @dragons/web test -- slot-card`
Expected: FAIL.

- [ ] **Step 3: Rewrite the component**

Replace `apps/web/src/components/admin/referee-hub/open-slots/slot-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { fetchAPI, APIError } from "@/lib/api";
import { Button } from "@dragons/ui/components/button";
import { CandidatePicker } from "./candidate-picker";

export type SlotStatus = "open" | "offered" | "assigned";

interface Assignment {
  refereeApiId: number | null;
  refereeName: string | null;
  status: SlotStatus;
}

interface Props {
  gameApiId: number;
  slotNumber: 1 | 2;
  assignment: Assignment;
  onChange: () => void;
}

export function SlotCard({ gameApiId, slotNumber, assignment, onChange }: Props) {
  const t = useTranslations("refereeHub.openSlots");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAssign(refereeApiId: number) {
    setBusy(true);
    setError(null);
    try {
      await fetchAPI(`/admin/referee/games/${gameApiId}/assign`, {
        method: "POST",
        body: JSON.stringify({ slotNumber, refereeApiId }),
      });
      onChange();
    } catch (err) {
      setError(err instanceof APIError ? err.message : err instanceof Error ? err.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign() {
    setBusy(true);
    setError(null);
    try {
      await fetchAPI(`/admin/referee/games/${gameApiId}/assignment/${slotNumber}`, { method: "DELETE" });
      onChange();
    } catch (err) {
      setError(err instanceof APIError ? err.message : err instanceof Error ? err.message : "Unassign failed");
    } finally {
      setBusy(false);
    }
  }

  const isOpen = assignment.status === "open";

  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs text-muted-foreground">{t("slot.label", { n: String(slotNumber) })}</div>
          {isOpen ? (
            <div className="text-sm font-semibold text-amber-700 dark:text-amber-400">{t("slot.open")}</div>
          ) : (
            <div className="text-sm font-semibold">{assignment.refereeName ?? "—"}</div>
          )}
        </div>
        {!isOpen && (
          <Button variant="outline" size="sm" disabled={busy} onClick={handleUnassign}>{t("slot.unassign")}</Button>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between text-xs rounded-md bg-destructive/10 text-destructive px-2 py-1">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>{t("errorChip.dismiss")}</Button>
        </div>
      )}

      {isOpen && (
        <CandidatePicker
          gameApiId={gameApiId}
          slotNumber={slotNumber}
          onPick={handleAssign}
          disabled={busy}
        />
      )}
    </div>
  );
}
```

Add `refereeHub.openSlots.errorChip.dismiss` to en/de. Remove `refereeHub.openSlots.toast.{assigned,unassigned,assignFailed,unassignFailed}` from both files and from `en.d.json.ts`.

- [ ] **Step 4: Run, expect pass**

Run: `pnpm --filter @dragons/web test -- slot-card && pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/slot-card.tsx \
        apps/web/src/components/admin/referee-hub/open-slots/slot-card.test.tsx \
        apps/web/src/messages/en.json apps/web/src/messages/de.json apps/web/src/messages/en.d.json.ts
git commit -m "fix(web): replace slot-card toasts with dismissible inline error chip"
```

---

### Task 17: Open-games list — server `slotStatus` + AutoSizer

**Files:**
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx`
- Modify: `apps/web/src/lib/swr-keys.ts`
- Modify: `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.test.tsx`

- [ ] **Step 1: Extend the SWR key**

In `apps/web/src/lib/swr-keys.ts`, extend the `refereeGamesFiltered` opts and serialization:

```ts
refereeGamesFiltered: (opts: {
  status?: "active" | "all";
  slotStatus?: "open" | "offered" | "any";
  league?: string[];
  // ...rest unchanged
} = {}) => {
  const qs = new URLSearchParams();
  qs.set("status", opts.status ?? "active");
  qs.set("limit", String(opts.limit ?? 100));
  qs.set("offset", String(opts.offset ?? 0));
  if (opts.slotStatus) qs.set("slotStatus", opts.slotStatus);
  // ...rest unchanged
  return `/referee/games?${qs.toString()}`;
},
```

- [ ] **Step 2: Update tests**

Extend `open-games-list.test.tsx`:

```ts
it("maps filters.status=open to slotStatus=open in the SWR key", () => {
  let observed = "";
  vi.mocked(useSWR).mockImplementation((key: string) => { observed = key; return { data: { items: [] } } as never; });
  render(wrap(<OpenGamesList filters={{ status: "open", league: [], dateFrom: null, dateTo: null, gameType: "both" }} selectedGameId={null} onSelect={() => {}} />));
  expect(observed).toContain("slotStatus=open");
  expect(observed).not.toMatch(/slotStatus=any/);
});

it("maps filters.status=any to no slotStatus param (server returns all)", () => {
  let observed = "";
  vi.mocked(useSWR).mockImplementation((key: string) => { observed = key; return { data: { items: [] } } as never; });
  render(wrap(<OpenGamesList filters={{ status: "any", league: [], dateFrom: null, dateTo: null, gameType: "both" }} selectedGameId={null} onSelect={() => {}} />));
  expect(observed).not.toContain("slotStatus=");
});
```

(Drop the old test asserting client-side post-filter behavior, if present.)

- [ ] **Step 3: Run, expect failure**

Run: `pnpm --filter @dragons/web test -- open-games-list`
Expected: FAIL.

- [ ] **Step 4: Rewrite the relevant logic**

In `apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx`:

1. Replace the `serverStatus` mapping and client filter with this:

```tsx
const slotStatus =
  filters.status === "open" ? "open" :
  filters.status === "offered" ? "offered" :
  undefined; // "any" → no slotStatus, server returns everything active

const key = SWR_KEYS.refereeGamesFiltered({
  status: "active",
  slotStatus,
  league: filters.league,
  dateFrom: filters.dateFrom ?? undefined,
  dateTo: filters.dateTo ?? undefined,
  gameType: filters.gameType,
  search: debouncedSearch.length >= 3 ? debouncedSearch : undefined,
  limit: 200,
  offset: 0,
});

// remove the `rows = (data?.items ?? []).filter(...)` post-filter; just:
const rows = data?.items ?? [];
```

2. Replace the hard-coded `height={600}` with a container-driven height. The simplest approach without adding a dep:

```tsx
import { useEffect, useRef, useState } from "react";
// ...
const containerRef = useRef<HTMLDivElement | null>(null);
const [height, setHeight] = useState(400);
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  const ro = new ResizeObserver(() => setHeight(el.clientHeight));
  ro.observe(el);
  setHeight(el.clientHeight);
  return () => ro.disconnect();
}, []);

// then:
<div ref={containerRef} className="flex-1 min-h-0">
  {/* ...empty/error/loading states unchanged... */}
  {rows.length > 0 && (
    <List height={height} itemCount={rows.length} itemSize={ROW_HEIGHT} width="100%">
      {Row}
    </List>
  )}
</div>
```

(`min-h-0` on the flex child is required for `flex-1` to behave correctly inside the 3-pane grid.)

- [ ] **Step 5: Run, expect pass**

Run: `pnpm --filter @dragons/web test -- open-games-list && pnpm --filter @dragons/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin/referee-hub/open-slots/open-games-list.tsx \
        apps/web/src/components/admin/referee-hub/open-slots/open-games-list.test.tsx \
        apps/web/src/lib/swr-keys.ts
git commit -m "fix(web): use server slotStatus filter and container-driven height for open-games list"
```

---

### Task 18: Final i18n / dead-code sweep + branch verification

**Files:**
- Modify: `apps/web/src/messages/en.json`, `apps/web/src/messages/de.json`, `apps/web/src/messages/en.d.json.ts`

- [ ] **Step 1: Remove `referees.columns.roles`**

Remove the `"roles": "Roles"` line under `referees.columns` in `en.json` and the corresponding `"roles": "Rollen"` in `de.json`. Regenerate `en.d.json.ts` if there is a generator script — search `package.json` of `@dragons/web` for a `messages` or `i18n` script; if found, run it. Otherwise edit `en.d.json.ts` directly to match.

- [ ] **Step 2: Grep for any other leftover keys**

Run: `grep -rn "refereeHub" apps/web/src/messages/*.json | grep -E "(toast\.assigned|toast\.unassigned|toast\.assignFailed|toast\.unassignFailed)" || echo OK`
Expected: `OK` (keys already removed in Task 16; re-verify).

Run: `grep -rn "columns\.roles" apps/web/src 2>&1 | grep -v node_modules || echo OK`
Expected: `OK`.

- [ ] **Step 3: Re-run knip**

Run: `pnpm knip`
Expected: previously flagged `RefereeScope`, `RefereeSort`, `HubStatus`, `HubGameType`, `HubScope` no longer appear in the unused exports list. If new dead exports introduced by Plan 2 show up (likely the `RulesSubtab` `Rule` interface if unused elsewhere — it should be local), drop the `export` keyword.

- [ ] **Step 4: Full check**

Run: `pnpm typecheck && pnpm --filter @dragons/api test && pnpm --filter @dragons/web test && pnpm check:ai-slop`
Expected: PASS for all four.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/messages/en.json apps/web/src/messages/de.json apps/web/src/messages/en.d.json.ts
git commit -m "chore(web): remove unused referees.columns.roles i18n key"
```

---

## Final verification

Once Task 18 commits, the branch should pass:

- `pnpm typecheck`
- `pnpm --filter @dragons/api test` (≥ 2828 + new Plan 2 cases)
- `pnpm --filter @dragons/web test` (≥ 148 + new Plan 2 cases, profile-subtab skips remain)
- `pnpm knip` (no Plan 2 dead exports)
- `pnpm check:ai-slop`
- `pnpm --filter @dragons/web lint`
- `pnpm audit` (if previously clean)

Manual smoke (browser): start `pnpm --filter @dragons/web dev` and `pnpm --filter @dragons/api dev`, navigate to `/admin/referees`, verify:

1. Scope chip toggles between Own/All with correct counts.
2. Search debounces (~300ms) and persists in URL after navigating away/back.
3. Sort select drives server order; URL reflects choice.
4. Selecting a referee fetches detail by id; deep-linking `?id=<n>` works for refs not on the current page.
5. Profile visibility switches autosave; KPI counts update after toggling Own Club.
6. Rules tab is disabled when Own Club is off; enabling Own Club re-enables it.
7. Rules subtab: add/edit/discard works without saving; Save bar shows inline error on 400; switching referees while dirty pops the browser confirm.
8. History rows show correct SR1/SR2 derived from apiId; Load more appends.
9. Open Slots: assigning a closed candidate shows inline error chip (no toast); dismiss works.
10. Open Slots: filter status=open returns only open-slot games; the total matches the rendered count.

---

## Self-review notes

- Spec section "Referees tab" → covered by Tasks 4, 5, 11, 12, 13, 14, 15.
- Spec section "Subtab: Rules" → Task 13.
- Spec section "Subtab: History" → Task 15 + Tasks 6/7 for backing data.
- Spec section "Open Slots polish" → Tasks 16 and 17.
- Spec section "Infra hardening" → Tasks 3 (Zod), 7 (parallel), 10 (TZ), 17 (AutoSizer).
- Spec section "Dead-code & i18n cleanup" → Tasks 1 (shared type), 4 (drop exports), 8 (drop URL state exports), 16 (toast keys), 18 (roles key + knip sweep).
- Each later task that references `SWR_KEYS.referee(id)`, `HubState.search`, `HubState.sort`, `slotStatus`, `RulesSubtab`, or `sr1RefereeApiId` consumes types defined in an earlier task — no forward-reference loops.
- All commits are conventional, no Co-Authored-By trailer, no AI credit.
